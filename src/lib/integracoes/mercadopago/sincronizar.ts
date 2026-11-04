import { eq } from "drizzle-orm";
import { classificarPendentes } from "../../classificacao/executar";
import { atualizarCompromissos } from "../../compromissos/servico";
import { atualizarAlertas } from "../../consultor/alertas";
import { hojeBrasil, primeiroDoMes, somarDias } from "../../datas";
import type { Db } from "../../db";
import { compromissos, contas, integracoes, titulares } from "../../db/schema";
import { gravarExtrato } from "../../importacao/persistir";
import type { Escopo } from "../../importacao/tipos";
import { ErroMercadoPago, mpGet, mpGetTexto, mpListarPagamentos, mpPost, type MpRelatorio, type MpUsuario } from "./cliente";
import { compromissoDoPagamento, lerRelatorioLiberacoes } from "./mapear";

const ID = "mercadopago";
const MESES_HISTORICO = 13;

export interface ResumoMercadoPago {
  conta: string | null;
  escopo: Escopo | null;
  pagamentos: number;
  lancamentosNovos: number;
  /** Relatório pedido ao Mercado Pago que ainda não ficou pronto (chega na próxima sincronização). */
  relatorioPendente: { inicio: string; fim: string } | null;
  avisos: string[];
}

interface DadosIntegracao {
  usuarioId?: number;
  escopo?: Escopo | null;
  relatorioPendente?: { inicio: string; fim: string; pedidoEm: string } | null;
  ultimoResumo?: ResumoMercadoPago;
}

const estado = globalThis as unknown as { __mpSincronizando?: boolean };
export const mercadoPagoSincronizando = () => Boolean(estado.__mpSincronizando);

function escopoDoDocumento(tipo: string | undefined): Escopo | null {
  if (tipo === "CNPJ") return "PJ";
  if (tipo === "CPF") return "PF";
  return null;
}

async function contaDoMercadoPago(db: Db, salva: number | null, escopo: Escopo | null): Promise<number> {
  if (salva) {
    const existe = await db.query.contas.findFirst({ where: eq(contas.id, salva) });
    if (existe) return existe.id;
  }
  const candidatas = await db.query.contas.findMany({ where: eq(contas.instituicaoId, ID) });
  const conta = candidatas.find((c) => c.tipo !== "cartao_credito" && (!escopo || c.escopoPadrao === escopo || c.escopoPadrao === "misto")) ?? candidatas.find((c) => c.tipo !== "cartao_credito");
  if (conta) return conta.id;
  const [nova] = await db
    .insert(contas)
    .values({ instituicaoId: ID, instituicaoNome: "Mercado Pago", apelido: `Mercado Pago${escopo ? ` · ${escopo}` : ""}`, tipo: "pagamento", escopoPadrao: escopo ?? "misto" })
    .returning({ id: contas.id });
  return nova.id;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Procura, entre os relatórios gerados, o do período pedido e devolve o nome do arquivo. */
async function relatorioPronto(inicio: string, fim: string, signal?: AbortSignal): Promise<string | null> {
  const lista = await mpGet<MpRelatorio[] | { results?: MpRelatorio[] }>("/v1/account/release_report/list", {}, signal);
  const itens = Array.isArray(lista) ? lista : (lista.results ?? []);
  const doPeriodo = itens
    .filter((r) => r.file_name && r.begin_date?.slice(0, 10) === inicio && r.end_date?.slice(0, 10) === fim)
    .sort((a, b) => (b.date_created ?? "").localeCompare(a.date_created ?? ""));
  return doPeriodo[0]?.file_name ?? null;
}

/** Pede o Relatório de Liberações do período. Se faltar a configuração de relatórios, cria uma padrão e tenta de novo. */
async function pedirRelatorio(inicio: string, fim: string, signal?: AbortSignal): Promise<void> {
  const corpo = { begin_date: `${inicio}T00:00:00Z`, end_date: `${fim}T23:59:59Z` };
  try {
    await mpPost("/v1/account/release_report", corpo, signal);
  } catch (erro) {
    if (!(erro instanceof ErroMercadoPago) || !erro.status || erro.status >= 500 || erro.status === 401) throw erro;
    await mpPost(
      "/v1/account/release_report/config",
      {
        file_name_prefix: "financeiro-app",
        include_withdrawal_at_end: false,
        execute_after_withdrawal: false,
        display_timezone: "GMT-03",
        frequency: { hour: 0, type: "monthly", value: 1 },
        columns: ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "MP_FEE_AMOUNT", "PAYMENT_METHOD", "BALANCE_AMOUNT"].map((key) => ({ key })),
      },
      signal,
    ).catch(() => undefined);
    await mpPost("/v1/account/release_report", corpo, signal);
  }
}

/**
 * Sincroniza o Mercado Pago (só leitura): dados da conta (PF ou PJ pelo CPF/CNPJ), pagamentos
 * recebidos (vão para A receber) e o extrato pelo Relatório de Liberações. O relatório é gerado
 * pelo Mercado Pago em segundo plano: se não ficar pronto em ~1 minuto, chega na próxima vez.
 */
export async function sincronizarMercadoPago(db: Db, opcoes: { signal?: AbortSignal; esperaRelatorioMs?: number } = {}): Promise<ResumoMercadoPago> {
  if (estado.__mpSincronizando) throw new ErroMercadoPago("Já existe uma sincronização do Mercado Pago em andamento.");
  estado.__mpSincronizando = true;
  const { signal } = opcoes;
  const hoje = hojeBrasil();
  const resumo: ResumoMercadoPago = { conta: null, escopo: null, pagamentos: 0, lancamentosNovos: 0, relatorioPendente: null, avisos: [] };
  try {
    const salvo = await db.query.integracoes.findFirst({ where: eq(integracoes.id, ID) });
    const dados = (salvo?.dados ?? {}) as DadosIntegracao;
    const primeiraVez = !salvo?.ultimaSincronizacao;
    await db.insert(integracoes).values({ id: ID, status: "sincronizando" }).onConflictDoUpdate({ target: integracoes.id, set: { status: "sincronizando", mensagem: null } });

    // 1. Quem é a conta (CPF → PF, CNPJ → PJ). O documento fica só no banco do app.
    const eu = await mpGet<MpUsuario>("/users/me", {}, signal);
    const escopo = escopoDoDocumento(eu.identification?.type);
    resumo.escopo = escopo;
    const documento = eu.identification?.number?.replace(/\D/g, "") || null;
    if (documento && escopo) {
      const nome = eu.company?.corporate_name || [eu.first_name, eu.last_name].filter(Boolean).join(" ") || (escopo === "PJ" ? "Minha empresa" : "Eu");
      await db.insert(titulares).values({ tipo: escopo, documento, nome }).onConflictDoNothing();
    }
    const contaId = await contaDoMercadoPago(db, salvo?.contaId ?? null, escopo);
    const conta = (await db.query.contas.findFirst({ where: eq(contas.id, contaId) }))!;
    resumo.conta = conta.apelido;
    const escopoConta: Escopo = conta.escopoPadrao === "PJ" ? "PJ" : "PF";

    // 2. Pagamentos recebidos → A receber.
    const inicioPagamentos = primeiraVez ? primeiroDoMes(-MESES_HISTORICO) : somarDias(hoje, -120);
    for await (const p of mpListarPagamentos(
      { sort: "date_created", criteria: "desc", range: "date_created", begin_date: `${inicioPagamentos}T00:00:00.000-03:00`, end_date: "NOW" },
      signal,
    )) {
      if (eu.id !== undefined && p.collector_id !== undefined && String(p.collector_id) !== String(eu.id)) continue; // só o que você recebeu
      const campos = compromissoDoPagamento(p, hoje, escopoConta);
      if (!campos) continue;
      await db
        .insert(compromissos)
        .values({ ...campos, contaId })
        .onConflictDoUpdate({ target: [compromissos.origem, compromissos.idExterno], set: { ...campos, contaId, atualizadoEm: new Date() } });
      resumo.pagamentos++;
    }

    // 3. Extrato pelo Relatório de Liberações, de onde parou até ontem.
    let extratoAte = salvo?.extratoAte ?? null;
    const inicio = salvo?.extratoAte ? somarDias(salvo.extratoAte, 1) : primeiroDoMes(-MESES_HISTORICO);
    const fim = somarDias(hoje, -1);
    let pendente = dados.relatorioPendente ?? null;
    try {
      if (inicio <= fim) {
        if (!pendente || pendente.inicio !== inicio) {
          await pedirRelatorio(inicio, fim, signal);
          pendente = { inicio, fim, pedidoEm: new Date().toISOString() };
        }
        let arquivo: string | null = null;
        const limite = Date.now() + (opcoes.esperaRelatorioMs ?? 60_000);
        for (;;) {
          arquivo = await relatorioPronto(pendente.inicio, pendente.fim, signal);
          if (arquivo || Date.now() >= limite) break;
          await espera(10_000);
        }
        if (arquivo) {
          const csv = await mpGetTexto(`/v1/account/release_report/${encodeURIComponent(arquivo)}`, signal);
          const extrato = lerRelatorioLiberacoes(csv, { escopo: conta.escopoPadrao === "misto" ? null : escopoConta });
          resumo.avisos.push(...extrato.avisos);
          if (extrato.transacoes.length > 0) {
            const gravado = await gravarExtrato(db, extrato, { contaId, nomeArquivo: `Mercado Pago (API) ${pendente.inicio} a ${pendente.fim}`, hashArquivo: `api:mercadopago:${pendente.inicio}:${pendente.fim}:${Date.now()}` });
            resumo.lancamentosNovos = gravado.novas;
          }
          extratoAte = pendente.fim;
          pendente = null;
        } else {
          resumo.relatorioPendente = { inicio: pendente.inicio, fim: pendente.fim };
          resumo.avisos.push("O Mercado Pago ainda está gerando o extrato; ele entra na próxima sincronização.");
        }
      }
    } catch (erro) {
      // O extrato pela API é o passo mais sujeito a variação: não derruba o resto da sincronização.
      resumo.avisos.push(
        `Extrato pela API indisponível (${erro instanceof Error ? erro.message.slice(0, 160) : String(erro)}). Alternativa: baixe o Relatório de Liberações no painel do Mercado Pago e importe o CSV em Importar.`,
      );
    }

    await db
      .update(integracoes)
      .set({
        status: "ok",
        mensagem: resumo.avisos.length ? resumo.avisos.slice(0, 3).join(" ") : null,
        ultimaSincronizacao: new Date(),
        extratoAte,
        contaId,
        dados: { usuarioId: eu.id, escopo, relatorioPendente: pendente, ultimoResumo: resumo } satisfies DadosIntegracao,
      })
      .where(eq(integracoes.id, ID));

    await atualizarCompromissos(db).catch((erro) => console.error("Falha ao conciliar contas", erro));
    if (resumo.lancamentosNovos > 0) await classificarPendentes(db, { signal }).catch((erro) => console.error("Classificação após Mercado Pago falhou", erro));
    await atualizarAlertas(db, { atualizarCompromissos: false }).catch(() => undefined);
    return resumo;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await db.insert(integracoes).values({ id: ID, status: "erro", mensagem }).onConflictDoUpdate({ target: integracoes.id, set: { status: "erro", mensagem } });
    throw erro;
  } finally {
    estado.__mpSincronizando = false;
  }
}
