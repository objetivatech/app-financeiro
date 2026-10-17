import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { Db } from "./db";
import { categorias, contas, transacoes } from "./db/schema";

/** Naturezas que só trocam dinheiro de bolso: não são receita nem despesa. */
export const NATUREZAS_MOVIMENTACAO = [
  "transferencia_interna",
  "pagamento_fatura",
  "investimento",
  "retirada_socio",
  "pro_labore",
  "distribuicao_lucros",
  "aporte_socio",
] as const;

export interface Periodo {
  inicio: string;
  fim: string;
}

export function periodoDoMes(mes: string): Periodo {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export async function mesMaisRecenteComDados(db: Db): Promise<string | null> {
  const [linha] = await db.select({ data: sql<string | null>`max(${transacoes.data})` }).from(transacoes);
  return linha?.data ? linha.data.slice(0, 7) : null;
}

const noPeriodo = (p: Periodo) => and(gte(transacoes.data, p.inicio), lte(transacoes.data, p.fim));
const ehMovimentacao = sql`${transacoes.natureza} in ('transferencia_interna','pagamento_fatura','investimento','retirada_socio','pro_labore','distribuicao_lucros','aporte_socio')`;
const soma = (condicao: SQL) => sql<number>`coalesce(sum(case when ${condicao} then ${transacoes.valorCentavos} else 0 end), 0)::bigint`;
const conta = (condicao: SQL) => sql<number>`count(*) filter (where ${condicao})::int`;

export interface ResumoPeriodo {
  pjReceitas: number;
  pjDespesas: number;
  pfReceitas: number;
  pfDespesas: number;
  /** Dinheiro que saiu da empresa para o sócio (Pix para a PF, pró-labore, lucros). Valor positivo. */
  retiradas: number;
  /** Gastos pessoais pagos pela empresa: na prática, retirada disfarçada. Valor positivo. */
  pessoalNaPj: number;
  /** Gastos da empresa pagos com dinheiro pessoal. Valor positivo. */
  pjNaPf: number;
  aportes: number;
  semEscopo: number;
  paraRevisar: number;
  total: number;
}

export async function resumoDoPeriodo(db: Db, p: Periodo): Promise<ResumoPeriodo> {
  const [r] = await db
    .select({
      pjReceitas: soma(sql`${transacoes.escopo} = 'PJ' and ${transacoes.valorCentavos} > 0 and not ${ehMovimentacao}`),
      pjDespesas: soma(sql`${transacoes.escopo} = 'PJ' and ${transacoes.valorCentavos} < 0 and not ${ehMovimentacao}`),
      pfReceitas: soma(sql`${transacoes.escopo} = 'PF' and ${transacoes.valorCentavos} > 0 and not ${ehMovimentacao}`),
      pfDespesas: soma(sql`${transacoes.escopo} = 'PF' and ${transacoes.valorCentavos} < 0 and not ${ehMovimentacao}`),
      // Conta só a perna de saída (da empresa) para não contar a mesma retirada duas vezes.
      retiradas: soma(sql`${transacoes.natureza} in ('retirada_socio','pro_labore','distribuicao_lucros') and ${transacoes.valorCentavos} < 0`),
      pessoalNaPj: soma(sql`${transacoes.natureza} = 'despesa_pessoal_na_pj'`),
      pjNaPf: soma(sql`${transacoes.natureza} = 'despesa_pj_na_pf'`),
      aportes: soma(sql`${transacoes.natureza} = 'aporte_socio' and ${transacoes.valorCentavos} < 0`),
      semEscopo: conta(sql`${transacoes.escopo} is null and not ${ehMovimentacao}`),
      paraRevisar: conta(sql`${transacoes.revisar}`),
      total: sql<number>`count(*)::int`,
    })
    .from(transacoes)
    .where(noPeriodo(p));
  // `|| 0` normaliza o -0 (que o Intl formata como "-R$ 0,00").
  const neg = (v: number) => -Number(v) || 0;
  return {
    pjReceitas: Number(r.pjReceitas),
    pjDespesas: neg(r.pjDespesas),
    pfReceitas: Number(r.pfReceitas),
    pfDespesas: neg(r.pfDespesas),
    retiradas: neg(r.retiradas),
    pessoalNaPj: neg(r.pessoalNaPj),
    pjNaPf: neg(r.pjNaPf),
    aportes: neg(r.aportes),
    semEscopo: r.semEscopo,
    paraRevisar: r.paraRevisar,
    total: r.total,
  };
}

export interface LinhaCategoria {
  categoriaId: string | null;
  nome: string;
  escopo: "PF" | "PJ" | null;
  totalCentavos: number;
  quantidade: number;
}

/** Despesas por categoria no período (valores positivos), maiores primeiro. */
export async function despesasPorCategoria(db: Db, p: Periodo): Promise<LinhaCategoria[]> {
  const linhas = await db
    .select({
      categoriaId: transacoes.categoriaId,
      nome: sql<string>`coalesce(${categorias.nome}, 'Sem categoria')`,
      escopo: transacoes.escopo,
      totalCentavos: sql<number>`(-sum(${transacoes.valorCentavos}))::bigint`,
      quantidade: sql<number>`count(*)::int`,
    })
    .from(transacoes)
    .leftJoin(categorias, eq(categorias.id, transacoes.categoriaId))
    .where(and(noPeriodo(p), sql`${transacoes.valorCentavos} < 0`, sql`not ${ehMovimentacao}`))
    .groupBy(transacoes.categoriaId, categorias.nome, transacoes.escopo)
    .orderBy(sql`sum(${transacoes.valorCentavos})`);
  return linhas.map((l) => ({ ...l, totalCentavos: Number(l.totalCentavos) }));
}

export interface LinhaMensal {
  mes: string;
  pjResultado: number;
  pfDespesas: number;
  retiradas: number;
}

export async function serieMensal(db: Db, meses = 6, ate?: string): Promise<LinhaMensal[]> {
  const fim = ate ?? (await mesMaisRecenteComDados(db));
  if (!fim) return [];
  const [ano, m] = fim.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, m - meses, 1)).toISOString().slice(0, 10);
  const linhas = await db
    .select({
      mes: sql<string>`to_char(${transacoes.data}, 'YYYY-MM')`,
      pjResultado: soma(sql`${transacoes.escopo} = 'PJ' and not ${ehMovimentacao}`),
      pfDespesas: soma(sql`${transacoes.escopo} = 'PF' and ${transacoes.valorCentavos} < 0 and not ${ehMovimentacao}`),
      retiradas: soma(sql`${transacoes.natureza} in ('retirada_socio','pro_labore','distribuicao_lucros','despesa_pessoal_na_pj') and ${transacoes.valorCentavos} < 0`),
    })
    .from(transacoes)
    .where(and(gte(transacoes.data, inicio), lte(transacoes.data, periodoDoMes(fim).fim)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return linhas.map((l) => ({
    mes: l.mes,
    pjResultado: Number(l.pjResultado),
    pfDespesas: -Number(l.pfDespesas) || 0,
    retiradas: -Number(l.retiradas) || 0,
  }));
}

export interface FiltroTransacoes {
  periodo?: Periodo;
  contaId?: number;
  escopo?: "PF" | "PJ" | "sem";
  revisar?: boolean;
  busca?: string;
  limite?: number;
}

export async function listarTransacoes(db: Db, f: FiltroTransacoes) {
  const condicoes: SQL[] = [];
  if (f.periodo) condicoes.push(noPeriodo(f.periodo)!);
  if (f.contaId) condicoes.push(eq(transacoes.contaId, f.contaId));
  if (f.escopo === "sem") condicoes.push(sql`${transacoes.escopo} is null`);
  else if (f.escopo) condicoes.push(eq(transacoes.escopo, f.escopo));
  if (f.revisar) condicoes.push(eq(transacoes.revisar, true));
  if (f.busca) condicoes.push(sql`${transacoes.descricao} ilike ${"%" + f.busca + "%"}`);

  return db
    .select({
      id: transacoes.id,
      data: transacoes.data,
      descricao: transacoes.descricao,
      descricaoNormalizada: transacoes.descricaoNormalizada,
      valorCentavos: transacoes.valorCentavos,
      escopo: transacoes.escopo,
      categoriaId: transacoes.categoriaId,
      natureza: transacoes.natureza,
      classificadoPor: transacoes.classificadoPor,
      motivo: transacoes.motivo,
      confianca: transacoes.confianca,
      revisar: transacoes.revisar,
      parcelaAtual: transacoes.parcelaAtual,
      parcelaTotal: transacoes.parcelaTotal,
      contaId: transacoes.contaId,
      contaApelido: contas.apelido,
      contaEscopo: contas.escopoPadrao,
    })
    .from(transacoes)
    .innerJoin(contas, eq(contas.id, transacoes.contaId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(transacoes.data), desc(transacoes.id))
    .limit(f.limite ?? 500);
}

export type TransacaoListada = Awaited<ReturnType<typeof listarTransacoes>>[number];

/** Contas com quantidade de transações e período coberto pelas importações. */
export async function listarContas(db: Db) {
  return db
    .select({
      id: contas.id,
      apelido: contas.apelido,
      instituicaoNome: contas.instituicaoNome,
      tipo: contas.tipo,
      agencia: contas.agencia,
      numero: contas.numero,
      finalCartao: contas.finalCartao,
      escopoPadrao: contas.escopoPadrao,
      ativa: contas.ativa,
      candidataEncerrar: contas.candidataEncerrar,
      observacao: contas.observacao,
      quantidade: sql<number>`count(${transacoes.id})::int`,
      primeira: sql<string | null>`min(${transacoes.data})`,
      ultima: sql<string | null>`max(${transacoes.data})`,
      movimentado: sql<number>`coalesce(sum(abs(${transacoes.valorCentavos})), 0)::bigint`,
    })
    .from(contas)
    .leftJoin(transacoes, eq(transacoes.contaId, contas.id))
    .groupBy(contas.id)
    .orderBy(asc(contas.apelido));
}

export type ContaListada = Awaited<ReturnType<typeof listarContas>>[number];
