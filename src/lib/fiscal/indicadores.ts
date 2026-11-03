import { and, eq, gte, sql } from "drizzle-orm";
import { hojeBrasil, primeiroDoMes, somarDias } from "../datas";
import type { Db } from "../db";
import { clientes, compromissos, notasFiscais } from "../db/schema";
import { obterPerfilFiscal, type PerfilFiscal } from "./perfil";
import { diagnosticarFatorR, type DiagnosticoFatorR } from "./simples";

export interface ReceitaMensal {
  mes: string;
  valorCentavos: number;
}

/**
 * Receita bruta por mês. Usa as notas fiscais autorizadas (o que o Simples considera);
 * nos meses sem nota, cai para as cobranças recebidas no mês.
 */
export async function receitaPorMes(db: Db, meses: number): Promise<{ serie: ReceitaMensal[]; fonte: "notas" | "recebimentos" | "misto" }> {
  const inicio = primeiroDoMes(-(meses - 1));
  const porNotas = await db
    .select({ mes: sql<string>`to_char(${notasFiscais.dataEmissao}, 'YYYY-MM')`, total: sql<number>`sum(${notasFiscais.valorCentavos})::bigint` })
    .from(notasFiscais)
    .where(and(gte(notasFiscais.dataEmissao, inicio), eq(notasFiscais.status, "AUTHORIZED")))
    .groupBy(sql`1`);
  const porRecebimento = await db
    .select({ mes: sql<string>`to_char(${compromissos.dataPagamento}, 'YYYY-MM')`, total: sql<number>`sum(${compromissos.valorCentavos})::bigint` })
    .from(compromissos)
    .where(and(eq(compromissos.tipo, "receber"), eq(compromissos.status, "pago"), gte(compromissos.dataPagamento, inicio)))
    .groupBy(sql`1`);
  const notas = new Map(porNotas.map((r) => [r.mes, Number(r.total)]));
  const recebidos = new Map(porRecebimento.map((r) => [r.mes, Number(r.total)]));

  const serie: ReceitaMensal[] = [];
  let usouNotas = false;
  let usouRecebidos = false;
  for (let i = meses - 1; i >= 0; i--) {
    const mes = primeiroDoMes(-i).slice(0, 7);
    if (notas.has(mes)) {
      usouNotas = true;
      serie.push({ mes, valorCentavos: notas.get(mes)! });
    } else {
      if (recebidos.has(mes)) usouRecebidos = true;
      serie.push({ mes, valorCentavos: recebidos.get(mes) ?? 0 });
    }
  }
  return { serie, fonte: usouNotas && usouRecebidos ? "misto" : usouNotas ? "notas" : "recebimentos" };
}

export interface IndicadoresFiscais {
  perfil: PerfilFiscal;
  receitaMensal: ReceitaMensal[];
  fonte: "notas" | "recebimentos" | "misto";
  /** Meses (dos 12 anteriores) que têm alguma receita registrada. */
  mesesComDados: number;
  receitaMesAtualCentavos: number;
  diagnostico: DiagnosticoFatorR;
}

/**
 * Fator R e DAS estimado do mês corrente. RBT12 = receita dos 12 meses anteriores ao mês atual
 * (regra do Simples). A folha usa o pró-labore cadastrado × 12.
 */
export async function indicadoresFiscais(db: Db): Promise<IndicadoresFiscais> {
  const perfil = await obterPerfilFiscal(db);
  const { serie, fonte } = await receitaPorMes(db, 13);
  const anteriores = serie.slice(0, 12);
  const atual = serie[12];
  const rbt12 = anteriores.reduce((s, m) => s + m.valorCentavos, 0);
  const diagnostico = diagnosticarFatorR({
    rbt12Centavos: rbt12,
    folha12Centavos: perfil.proLaboreMensalCentavos * 12,
    receitaDoMesCentavos: atual.valorCentavos,
    proLaboreMensalCentavos: perfil.proLaboreMensalCentavos,
  });
  return {
    perfil,
    receitaMensal: serie,
    fonte,
    mesesComDados: anteriores.filter((m) => m.valorCentavos > 0).length,
    receitaMesAtualCentavos: atual.valorCentavos,
    diagnostico,
  };
}

export interface ResumoRecebiveis {
  aReceber30dCentavos: number;
  aReceber30dQtd: number;
  vencidoCentavos: number;
  vencidoQtd: number;
  recebidoMesCentavos: number;
  /** Vencido ÷ (vencido + recebido nos últimos 90 dias). */
  inadimplencia: number;
  /** Média de dias entre o vencimento e o pagamento (negativo = pagam adiantado). */
  atrasoMedioDias: number | null;
  /** Participação do maior cliente na receita dos últimos 12 meses. */
  maiorCliente: { nome: string; participacao: number } | null;
}

export async function resumoRecebiveis(db: Db): Promise<ResumoRecebiveis> {
  const hoje = hojeBrasil();
  const em30 = somarDias(hoje, 30);
  const ha90 = somarDias(hoje, -90);
  const ha12m = primeiroDoMes(-12);
  const receber = eq(compromissos.tipo, "receber");

  const [r] = await db
    .select({
      aReceber: sql<number>`coalesce(sum(${compromissos.valorCentavos}) filter (where ${compromissos.status} = 'aberto' and ${compromissos.vencimento} <= ${em30}), 0)::bigint`,
      aReceberQtd: sql<number>`count(*) filter (where ${compromissos.status} = 'aberto' and ${compromissos.vencimento} <= ${em30})::int`,
      vencido: sql<number>`coalesce(sum(${compromissos.valorCentavos}) filter (where ${compromissos.status} = 'vencido'), 0)::bigint`,
      vencidoQtd: sql<number>`count(*) filter (where ${compromissos.status} = 'vencido')::int`,
      recebidoMes: sql<number>`coalesce(sum(${compromissos.valorCentavos}) filter (where ${compromissos.status} = 'pago' and ${compromissos.dataPagamento} >= ${primeiroDoMes()}), 0)::bigint`,
      recebido90: sql<number>`coalesce(sum(${compromissos.valorCentavos}) filter (where ${compromissos.status} = 'pago' and ${compromissos.dataPagamento} >= ${ha90}), 0)::bigint`,
      atraso: sql<number | null>`avg(${compromissos.dataPagamento} - ${compromissos.vencimento}) filter (where ${compromissos.status} = 'pago' and ${compromissos.dataPagamento} >= ${ha90})`,
    })
    .from(compromissos)
    .where(receber);

  const porCliente = await db
    .select({ nome: clientes.nome, total: sql<number>`sum(${compromissos.valorCentavos})::bigint` })
    .from(compromissos)
    .innerJoin(clientes, eq(clientes.id, compromissos.clienteId))
    .where(and(receber, eq(compromissos.status, "pago"), gte(compromissos.dataPagamento, ha12m)))
    .groupBy(clientes.nome)
    .orderBy(sql`2 desc`);
  const total12m = porCliente.reduce((s, c) => s + Number(c.total), 0);

  const vencido = Number(r.vencido);
  const recebido90 = Number(r.recebido90);
  return {
    aReceber30dCentavos: Number(r.aReceber),
    aReceber30dQtd: r.aReceberQtd,
    vencidoCentavos: vencido,
    vencidoQtd: r.vencidoQtd,
    recebidoMesCentavos: Number(r.recebidoMes),
    inadimplencia: vencido + recebido90 > 0 ? vencido / (vencido + recebido90) : 0,
    atrasoMedioDias: r.atraso === null ? null : Math.round(Number(r.atraso) * 10) / 10,
    maiorCliente: porCliente[0] && total12m > 0 ? { nome: porCliente[0].nome, participacao: Number(porCliente[0].total) / total12m } : null,
  };
}
