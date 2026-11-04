import { and, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { hojeBrasil } from "../datas";
import type { Db } from "../db";
import { contas, transacoes } from "../db/schema";
import { deslocarMes } from "../formato";
import { SOMAS_ZERADAS, type SomasDoMes } from "./calculo";

const t = transacoes;
const soma = (condicao: SQL) => sql<number>`coalesce(sum(case when ${condicao} then ${t.valorCentavos} else 0 end), 0)::bigint`;
const saida = sql`${t.valorCentavos} < 0`;
const entrada = sql`${t.valorCentavos} > 0`;
const comum = sql`${t.natureza} in ('comum','despesa_pj_na_pf')`;
const categoria = sql`coalesce(${t.categoriaId}, '')`;

/** Somas por mês (AAAA-MM) de `inicio` a `fim`, inclusive; meses sem dados vêm zerados. */
export async function somasPorMes(db: Db, inicio: string, fim: string): Promise<SomasDoMes[]> {
  const ultimoDia = new Date(Date.UTC(Number(fim.slice(0, 4)), Number(fim.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const linhas = await db
    .select({
      mes: sql<string>`to_char(${t.data}, 'YYYY-MM')`,
      // Estorno de uma venda (saída com natureza "estorno") abate a receita.
      pjReceitaServicos: soma(sql`${t.escopo} = 'PJ' and ((${entrada} and ${t.natureza} = 'comum' and ${categoria} <> 'pj_outras_receitas') or (${saida} and ${t.natureza} = 'estorno'))`),
      pjOutrasReceitas: soma(sql`${t.escopo} = 'PJ' and ${entrada} and ${t.natureza} = 'comum' and ${categoria} = 'pj_outras_receitas'`),
      pjEstornos: soma(sql`${t.escopo} = 'PJ' and ${entrada} and ${t.natureza} = 'estorno'`),
      pjImpostos: soma(sql`${t.escopo} = 'PJ' and ${saida} and (${t.natureza} = 'imposto' or (${comum} and ${categoria} = 'pj_impostos'))`),
      pjDividas: soma(sql`${t.escopo} = 'PJ' and ${saida} and ${comum} and ${categoria} = 'pj_dividas'`),
      pjDespesas: soma(sql`${t.escopo} = 'PJ' and ${saida} and ${comum} and ${categoria} not in ('pj_impostos','pj_dividas')`),
      saidaProLabore: soma(sql`${t.natureza} = 'pro_labore' and ${saida}`),
      saidaLucros: soma(sql`${t.natureza} = 'distribuicao_lucros' and ${saida}`),
      saidaRetirada: soma(sql`${t.natureza} = 'retirada_socio' and ${saida}`),
      entradaProLabore: soma(sql`${t.natureza} = 'pro_labore' and ${entrada}`),
      entradaLucros: soma(sql`${t.natureza} = 'distribuicao_lucros' and ${entrada}`),
      entradaRetirada: soma(sql`${t.natureza} = 'retirada_socio' and ${entrada}`),
      pessoalNaPj: soma(sql`${t.natureza} = 'despesa_pessoal_na_pj'`),
      pjNaPf: soma(sql`${t.natureza} = 'despesa_pj_na_pf'`),
      aporteSaidaPf: soma(sql`${t.natureza} = 'aporte_socio' and ${saida}`),
      aporteEntradaPj: soma(sql`${t.natureza} = 'aporte_socio' and ${entrada}`),
      pfEntradas: soma(sql`${t.escopo} = 'PF' and ((${entrada} and ${t.natureza} = 'comum') or (${saida} and ${t.natureza} = 'estorno'))`),
      pfEstornos: soma(sql`${t.escopo} = 'PF' and ${entrada} and ${t.natureza} = 'estorno'`),
      pfDividas: soma(sql`${t.escopo} = 'PF' and ${saida} and ${t.natureza} = 'comum' and ${categoria} = 'pf_dividas'`),
      pfDespesas: soma(sql`${t.escopo} = 'PF' and ${saida} and ${t.natureza} in ('comum','imposto') and ${categoria} <> 'pf_dividas'`),
      pfInvestimento: soma(sql`${t.natureza} = 'investimento' and coalesce(${t.escopo}, 'PF') = 'PF'`),
      pjInvestimento: soma(sql`${t.natureza} = 'investimento' and ${t.escopo} = 'PJ'`),
    })
    .from(t)
    .where(and(gte(t.data, `${inicio}-01`), lte(t.data, ultimoDia)))
    .groupBy(sql`1`);
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  const resultado: SomasDoMes[] = [];
  for (let mes = inicio; mes <= fim; mes = deslocarMes(mes, 1)) {
    const l = porMes.get(mes);
    const numeros = { ...SOMAS_ZERADAS };
    if (l) for (const k of Object.keys(SOMAS_ZERADAS) as (keyof typeof SOMAS_ZERADAS)[]) numeros[k] = Number(l[k]);
    resultado.push({ mes, ...numeros });
  }
  return resultado;
}

export interface Pendencias {
  semEscopo: number;
  paraRevisar: number;
  /** Saídas da empresa para você ainda sem definir se são pró-labore ou lucros. */
  retiradasIndefinidas: number;
  /** Lançamentos em contas mistas ainda sem PF/PJ. */
  emContaMista: number;
}

export async function pendenciasDoMes(db: Db, mes: string): Promise<Pendencias> {
  const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [r] = await db
    .select({
      semEscopo: sql<number>`count(*) filter (where ${t.escopo} is null and ${t.natureza} in ('comum','estorno','imposto'))::int`,
      paraRevisar: sql<number>`count(*) filter (where ${t.revisar})::int`,
      retiradasIndefinidas: sql<number>`count(*) filter (where ${t.natureza} = 'retirada_socio' and ${saida})::int`,
      emContaMista: sql<number>`count(*) filter (where ${t.escopo} is null and ${contas.escopoPadrao} = 'misto')::int`,
    })
    .from(t)
    .innerJoin(contas, eq(contas.id, t.contaId))
    .where(and(gte(t.data, `${mes}-01`), lte(t.data, ultimoDia)));
  return r;
}

/** Mês de referência dos painéis: o pedido na URL, ou o mais recente com dados (ou o atual). */
export async function mesDeReferencia(db: Db, pedido: unknown): Promise<string> {
  if (typeof pedido === "string" && /^\d{4}-\d{2}$/.test(pedido)) return pedido;
  const [linha] = await db.select({ data: sql<string | null>`max(${t.data})` }).from(t).where(lte(t.data, hojeBrasil()));
  return linha?.data ? linha.data.slice(0, 7) : hojeBrasil().slice(0, 7);
}

export interface LinhaCategoriaVisao {
  categoriaId: string | null;
  nome: string;
  totalCentavos: number;
  quantidade: number;
}

/** Maiores gastos do escopo no mês (valores positivos; estornos abatem). */
export async function gastosPorCategoria(db: Db, escopo: "PF" | "PJ", mes: string): Promise<LinhaCategoriaVisao[]> {
  const ultimoDia = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const naturezas = escopo === "PF" ? ["comum", "imposto", "despesa_pessoal_na_pj", "estorno"] : ["comum", "imposto", "despesa_pj_na_pf", "estorno"];
  const linhas = await db.execute<{ categoria_id: string | null; nome: string; total: string; quantidade: number }>(sql`
    select ${t.categoriaId} as categoria_id, coalesce(c.nome, 'Sem categoria') as nome,
           (-sum(${t.valorCentavos}))::bigint as total, count(*)::int as quantidade
    from ${t} left join categorias c on c.id = ${t.categoriaId}
    where ${t.escopo} = ${escopo} and ${t.data} between ${`${mes}-01`} and ${ultimoDia}
      and ${inArray(t.natureza, naturezas as ("comum" | "imposto" | "despesa_pessoal_na_pj" | "despesa_pj_na_pf" | "estorno")[])}
      and (${t.valorCentavos} < 0 or ${t.natureza} = 'estorno')
    group by 1, 2
    having sum(${t.valorCentavos}) < 0
    order by 3 desc`);
  return linhas.rows.map((l) => ({ categoriaId: l.categoria_id, nome: l.nome, totalCentavos: Number(l.total), quantidade: l.quantidade }));
}
