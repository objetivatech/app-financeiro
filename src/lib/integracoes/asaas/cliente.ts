/**
 * Cliente HTTP mínimo e somente-leitura da API v3 do Asaas.
 * Referência: especificação OpenAPI oficial (cobranças /v3/payments, clientes /v3/customers,
 * notas /v3/invoices, extrato /v3/financialTransactions, saldo /v3/finance/balance).
 */

export const URL_PRODUCAO = "https://api.asaas.com/v3";
export const URL_SANDBOX = "https://sandbox.asaas.com/api/v3";

export class ErroAsaas extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroAsaas";
  }
}

export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

function urlBase(): string {
  if (process.env.ASAAS_BASE_URL) return process.env.ASAAS_BASE_URL.replace(/\/$/, "");
  return process.env.ASAAS_AMBIENTE === "sandbox" ? URL_SANDBOX : URL_PRODUCAO;
}

interface Pagina<T> {
  object?: string;
  hasMore?: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data?: T[];
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET com autenticação, timeout e nova tentativa em limite de requisições (429) ou erro do servidor. */
export async function asaasGet<T>(caminho: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new ErroAsaas("ASAAS_API_KEY não configurada.");
  const url = new URL(urlBase() + caminho);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let tentativa = 0; ; tentativa++) {
    const sinais = [AbortSignal.timeout(30_000), ...(signal ? [signal] : [])];
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: { access_token: chave, "User-Agent": "app-financeiro-pfpj", Accept: "application/json" },
        signal: AbortSignal.any(sinais),
      });
    } catch (erro) {
      if (signal?.aborted || tentativa >= 2) throw new ErroAsaas(`Sem resposta do Asaas: ${(erro as Error).message}`);
      await espera(2000 * (tentativa + 1));
      continue;
    }
    if (resposta.ok) return (await resposta.json()) as T;
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 3) {
      await espera(Number(resposta.headers.get("retry-after")) * 1000 || 3000 * (tentativa + 1));
      continue;
    }
    if (resposta.status === 401) throw new ErroAsaas("Chave de API do Asaas inválida ou revogada.", 401);
    const corpo = await resposta.text().catch(() => "");
    throw new ErroAsaas(`Asaas respondeu ${resposta.status} em ${caminho}: ${corpo.slice(0, 300)}`, resposta.status);
  }
}

/** Percorre todas as páginas de uma listagem (limite máximo da API: 100 por página). */
export async function* asaasListar<T>(caminho: string, params: Record<string, string | number> = {}, signal?: AbortSignal): AsyncGenerator<T> {
  for (let offset = 0; ; ) {
    const pagina = await asaasGet<Pagina<T>>(caminho, { ...params, offset, limit: 100 }, signal);
    const itens = pagina.data ?? [];
    for (const item of itens) yield item;
    if (!pagina.hasMore || itens.length === 0) return;
    offset += itens.length;
  }
}

// Formatos usados (só os campos que o app lê).

export interface AsaasCliente {
  id: string;
  name?: string;
  cpfCnpj?: string;
  email?: string;
}

export type AsaasStatusCobranca =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | "REFUND_REQUESTED"
  | "REFUND_IN_PROGRESS"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "AWAITING_CHARGEBACK_REVERSAL"
  | "DUNNING_REQUESTED"
  | "DUNNING_RECEIVED"
  | "AWAITING_RISK_ANALYSIS";

export interface AsaasCobranca {
  id: string;
  customer?: string;
  value?: number;
  netValue?: number;
  description?: string;
  billingType?: string;
  status?: AsaasStatusCobranca;
  dueDate?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  creditDate?: string;
  estimatedCreditDate?: string;
  invoiceUrl?: string;
  installment?: string;
  installmentNumber?: number;
  deleted?: boolean;
}

export interface AsaasNota {
  id: string;
  status?: string;
  customer?: string;
  payment?: string;
  number?: string;
  value?: number;
  effectiveDate?: string;
  serviceDescription?: string;
  municipalServiceCode?: string;
  pdfUrl?: string;
  /** Impostos da nota; retainIss = ISS retido pelo tomador. */
  taxes?: { retainIss?: boolean; iss?: number };
}

export interface AsaasLancamento {
  id: string;
  value?: number;
  balance?: number;
  type?: string;
  date?: string;
  description?: string;
  paymentId?: string;
  transferId?: string;
  billId?: string;
  invoiceId?: string;
}
