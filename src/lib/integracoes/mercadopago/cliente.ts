/**
 * Cliente HTTP mínimo da API do Mercado Pago, só para leitura.
 * Endpoints usados: GET /users/me (dados da conta), GET /v1/payments/search (pagamentos recebidos)
 * e os do Relatório de Liberações (/v1/account/release_report): pedir o relatório de um período,
 * listar os prontos e baixar o CSV. Pedir um relatório não move dinheiro nem cria cobrança.
 * Autenticação: Access Token de produção ("APP_USR-...") no cabeçalho Authorization.
 */

const URL_BASE = "https://api.mercadopago.com";

export class ErroMercadoPago extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroMercadoPago";
  }
}

export function mercadoPagoConfigurado(): boolean {
  return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

function urlBase(): string {
  return (process.env.MERCADOPAGO_BASE_URL ?? URL_BASE).replace(/\/$/, "");
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requisitar(metodo: "GET" | "POST", caminho: string, opcoes: { params?: Record<string, string | number>; corpo?: unknown; signal?: AbortSignal } = {}): Promise<Response> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new ErroMercadoPago("MERCADOPAGO_ACCESS_TOKEN não configurado.");
  const url = new URL(urlBase() + caminho);
  for (const [k, v] of Object.entries(opcoes.params ?? {})) url.searchParams.set(k, String(v));
  for (let tentativa = 0; ; tentativa++) {
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "app-financeiro-pfpj",
          Accept: "application/json, text/csv",
          ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(opcoes.signal ? [opcoes.signal] : [])]),
      });
    } catch (erro) {
      if (opcoes.signal?.aborted || tentativa >= 2) throw new ErroMercadoPago(`Sem resposta do Mercado Pago: ${(erro as Error).message}`);
      await espera(2000 * (tentativa + 1));
      continue;
    }
    if (resposta.ok) return resposta;
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 3) {
      await espera(Number(resposta.headers.get("retry-after")) * 1000 || 3000 * (tentativa + 1));
      continue;
    }
    if (resposta.status === 401) throw new ErroMercadoPago("Access Token do Mercado Pago inválido ou revogado.", 401);
    const corpo = await resposta.text().catch(() => "");
    throw new ErroMercadoPago(`Mercado Pago respondeu ${resposta.status} em ${caminho}: ${corpo.slice(0, 300)}`, resposta.status);
  }
}

export async function mpGet<T>(caminho: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const r = await requisitar("GET", caminho, { params, signal });
  return (await r.json()) as T;
}

export async function mpPost<T>(caminho: string, corpo: unknown, signal?: AbortSignal): Promise<T | null> {
  const r = await requisitar("POST", caminho, { corpo, signal });
  const texto = await r.text();
  return texto ? (JSON.parse(texto) as T) : null;
}

export async function mpGetTexto(caminho: string, signal?: AbortSignal): Promise<string> {
  const r = await requisitar("GET", caminho, { signal });
  return r.text();
}

interface PaginaPagamentos {
  paging?: { total?: number; limit?: number; offset?: number };
  results?: MpPagamento[];
}

/** Percorre a busca de pagamentos (50 por página; a API aceita offset até 10.000). */
export async function* mpListarPagamentos(params: Record<string, string | number>, signal?: AbortSignal): AsyncGenerator<MpPagamento> {
  for (let offset = 0; offset <= 10_000; ) {
    const pagina = await mpGet<PaginaPagamentos>("/v1/payments/search", { ...params, limit: 50, offset }, signal);
    const itens = pagina.results ?? [];
    for (const p of itens) yield p;
    offset += itens.length;
    if (itens.length === 0 || offset >= (pagina.paging?.total ?? 0)) return;
  }
}

// Formatos usados (só os campos que o app lê).

export interface MpUsuario {
  id?: number;
  nickname?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  identification?: { type?: string; number?: string };
  company?: { corporate_name?: string; identification?: string } | null;
}

export interface MpPagamento {
  id?: number | string;
  date_created?: string;
  date_approved?: string | null;
  date_of_expiration?: string | null;
  money_release_date?: string | null;
  operation_type?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  status?: string;
  status_detail?: string;
  description?: string | null;
  external_reference?: string | null;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  transaction_details?: { net_received_amount?: number; installment_amount?: number };
  collector_id?: number | string;
  payer?: { id?: number | string; email?: string; first_name?: string | null; last_name?: string | null; identification?: { type?: string; number?: string } };
  installments?: number;
}

export interface MpRelatorio {
  id?: number;
  file_name?: string;
  begin_date?: string;
  end_date?: string;
  created_from?: string;
  status?: string;
  date_created?: string;
}
