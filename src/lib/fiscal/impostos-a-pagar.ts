import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { hojeBrasil } from "../datas";
import { formatarMes } from "../formato";
import type { Db } from "../db";
import { compromissos, notasFiscais, recorrencias, transacoes } from "../db/schema";
import { apurarCompetencia, deslocarCompetencia, type ApuracaoCompetencia } from "./apuracao";
import { inicioDaFolha, receitaPorMes } from "./indicadores";
import { obterPerfilFiscal, regimeNoMes } from "./perfil";
import { folhaDoFatorR } from "./simples";

export interface ImpostoDaCompetencia extends ApuracaoCompetencia {
  /** Pagamentos já feitos (conta a pagar conciliada com o extrato). */
  dasPago: { valorCentavos: number; data: string } | null;
  inssPago: { valorCentavos: number; data: string } | null;
}

/** Padrões de descrição das guias no extrato (para a baixa automática). */
export const PADRAO_DAS = /\bDAS\b|SIMPLES|PGDAS|DOCUMENTO DE ARRECADACAO/;
export const PADRAO_INSS = /INSS|\bGPS\b|DCTF|DARF|PREVID|RECEITA FED/;

/** Contas fixas cadastradas à mão que parecem ser o DAS ou o INSS (contariam em dobro com a estimativa). */
export async function contasFixasDeImposto(db: Db): Promise<{ id: number; descricao: string; imposto: "das" | "inss" }[]> {
  const ativas = await db.query.recorrencias.findMany({ where: eq(recorrencias.ativa, true) });
  return ativas
    .filter((r) => r.tipo !== "receber" && (r.categoriaId === "pj_impostos" || /\bDAS\b|SIMPLES|\bINSS\b|\bGPS\b|DCTF/i.test(r.descricao)))
    .map((r) => ({ id: r.id, descricao: r.descricao, imposto: /\bINSS\b|\bGPS\b|DCTF|PREVID/i.test(r.descricao) ? ("inss" as const) : ("das" as const) }));
}

/**
 * Impostos estimados de cada competência (mês das notas), dos `meses` mais recentes até o atual.
 * A competência atual ainda está aberta: o valor cresce conforme as notas do mês são emitidas.
 */
export async function impostosPorCompetencia(db: Db, meses = 6): Promise<ImpostoDaCompetencia[]> {
  const perfil = await obterPerfilFiscal(db);
  const atual = hojeBrasil().slice(0, 7);
  const competencias = Array.from({ length: meses }, (_, i) => deslocarCompetencia(atual, i - meses + 1));
  const { serie } = await receitaPorMes(db, meses + 12);
  const receita = new Map(serie.map((m) => [m.mes, m.valorCentavos]));
  const notas = await db
    .select({
      mes: sql<string>`to_char(${notasFiscais.dataEmissao}, 'YYYY-MM')`,
      quantidade: sql<number>`count(*)::int`,
      issRetido: sql<number>`coalesce(sum(case when ${notasFiscais.issRetido} then ${notasFiscais.valorCentavos} else 0 end), 0)::bigint`,
    })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.status, "AUTHORIZED"), gte(notasFiscais.dataEmissao, `${competencias[0]}-01`)))
    .groupBy(sql`1`);
  const porNotas = new Map(notas.map((n) => [n.mes, n]));
  const inicio = inicioDaFolha(perfil);
  const temFolha = (mes: string) => regimeNoMes(perfil, mes) === "simples" && (!inicio || mes >= inicio);

  const pagos = await db
    .select({ idExterno: compromissos.idExterno, valor: compromissos.valorCentavos, data: compromissos.dataPagamento })
    .from(compromissos)
    .where(and(eq(compromissos.origem, "imposto"), eq(compromissos.status, "pago")));
  const pago = (chave: string) => {
    const p = pagos.find((x) => x.idExterno === chave);
    return p?.data ? { valorCentavos: Number(p.valor), data: p.data } : null;
  };

  return competencias.map((competencia) => {
    const anteriores = Array.from({ length: 12 }, (_, i) => deslocarCompetencia(competencia, i - 12));
    const n = porNotas.get(competencia);
    const apuracao = apurarCompetencia({
      competencia,
      regime: regimeNoMes(perfil, competencia),
      receitaCentavos: receita.get(competencia) ?? 0,
      receitaIssRetidoCentavos: Number(n?.issRetido ?? 0),
      quantidadeNotas: n?.quantidade ?? 0,
      rbt12Centavos: anteriores.reduce((t, m) => t + (receita.get(m) ?? 0), 0),
      folha12Centavos: folhaDoFatorR(
        anteriores.map((m) => (temFolha(m) ? perfil.proLaboreMensalCentavos : 0)),
        temFolha(competencia) ? perfil.proLaboreMensalCentavos : 0,
      ),
      proLaboreCentavos: temFolha(competencia) ? perfil.proLaboreMensalCentavos : 0,
      sujeitoFatorR: perfil.sujeitoFatorR,
    });
    return { ...apuracao, dasPago: pago(`das:${competencia}`), inssPago: pago(`inss:${competencia}`) };
  });
}

/**
 * Lança em A pagar o DAS e o INSS estimados da competência passada (vence dia 20 deste mês) e da
 * atual (vence dia 20 do próximo). Atualiza o valor enquanto não foram pagos; o que já foi pago
 * fica como está (com o valor real do extrato).
 */
export async function atualizarImpostosAPagar(db: Db): Promise<void> {
  const hoje = hojeBrasil();
  const lista = (await impostosPorCompetencia(db, 2)).filter((c) => c.regime === "simples");
  // Conta fixa cadastrada à mão para o mesmo imposto: ela vale (a estimativa contaria em dobro).
  const manuais = new Set((await contasFixasDeImposto(db)).map((c) => c.imposto));
  for (const c of lista) {
    const rotulo = formatarMes(c.competencia);
    const aberta = c.competencia === hoje.slice(0, 7);
    const itens = [
      { chave: `das:${c.competencia}`, valor: c.dasCentavos ?? 0, descricao: `DAS do Simples — competência ${rotulo}${aberta ? " (parcial: mês em andamento)" : " (estimado)"}` },
      { chave: `inss:${c.competencia}`, valor: c.inssCentavos, descricao: `INSS do pró-labore — competência ${rotulo}` },
    ];
    for (const item of itens) {
      if (item.valor <= 0 || manuais.has(item.chave.startsWith("das:") ? "das" : "inss")) {
        // Sem receita, sem pró-labore ou com conta fixa própria: remove a estimativa que não foi paga.
        await db.delete(compromissos).where(and(eq(compromissos.origem, "imposto"), eq(compromissos.idExterno, item.chave), inArray(compromissos.status, ["aberto", "vencido"])));
        continue;
      }
      const valores = {
        tipo: "pagar" as const,
        escopo: "PJ" as const,
        descricao: item.descricao,
        valorCentavos: item.valor,
        vencimento: c.vencimento,
        categoriaId: "pj_impostos",
        origem: "imposto",
        idExterno: item.chave,
      };
      await db
        .insert(compromissos)
        .values({ ...valores, status: c.vencimento < hoje ? "vencido" : "aberto" })
        .onConflictDoUpdate({
          target: [compromissos.origem, compromissos.idExterno],
          set: { descricao: valores.descricao, valorCentavos: valores.valorCentavos, vencimento: valores.vencimento, atualizadoEm: new Date() },
          setWhere: sql`${compromissos.status} in ('aberto','vencido')`,
        });
    }
  }
}

/** Pagamentos de guias encontrados no extrato num mês (para conferir competências antigas). */
export async function guiasPagasNoMes(db: Db, mes: string): Promise<{ das: number; inss: number }> {
  const linhas = await db
    .select({ descricao: transacoes.descricaoNormalizada, valor: transacoes.valorCentavos })
    .from(transacoes)
    .where(and(sql`to_char(${transacoes.data}, 'YYYY-MM') = ${mes}`, sql`${transacoes.valorCentavos} < 0`, eq(transacoes.natureza, "imposto")));
  let das = 0;
  let inss = 0;
  for (const l of linhas) {
    if (PADRAO_DAS.test(l.descricao)) das -= Number(l.valor);
    else if (PADRAO_INSS.test(l.descricao)) inss -= Number(l.valor);
  }
  return { das, inss };
}
