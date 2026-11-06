import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { primeiroDoMes } from "./datas";
import type { Db } from "./db";
import { compromissos, contas, transacoes } from "./db/schema";
import { receitaPorMes } from "./fiscal/indicadores";

/**
 * Taxas e tarifas da empresa: tudo o que o Asaas (e os bancos PJ) cobram por notificação, Pix,
 * boleto, cartão, nota fiscal, transferência, antecipação... Lido das saídas do extrato (cada taxa
 * é um lançamento próprio no extrato do Asaas) e agrupado pelo tipo, que vem da descrição.
 */

export const TIPOS_TAXA = [
  { id: "notificacao", nome: "Notificações (SMS, WhatsApp, e-mail, voz, Correios)", padrao: /NOTIFICA|MENSAGERIA|\bSMS\b|WHATSAPP|ROBO DE VOZ|CORREIO|\bCARTA\b/ },
  { id: "pix", nome: "Pix", padrao: /\bPIX\b/ },
  { id: "boleto", nome: "Boletos", padrao: /BOLETO/ },
  { id: "cartao", nome: "Cartão de crédito e débito", padrao: /CARTAO|CREDIT CARD|DEBIT CARD|CREDITO|DEBITO/ },
  { id: "nota", nome: "Notas fiscais", padrao: /NOTA FISCAL|\bNFS|\bNF\b|NOTA DE SERVICO/ },
  { id: "transferencia", nome: "Transferências e saques", padrao: /TRANSFERENCIA|\bTED\b|\bDOC\b|SAQUE/ },
  { id: "antecipacao", nome: "Antecipação de recebíveis", padrao: /ANTECIPA/ },
  { id: "negativacao", nome: "Negativação e consultas (Serasa)", padrao: /SERASA|NEGATIVA|CONSULTA/ },
  { id: "mensalidade", nome: "Mensalidade, plano e pacote", padrao: /MENSALIDADE|PLANO|PACOTE|ASSINATURA|CESTA/ },
  { id: "cobranca", nome: "Cobranças (sem detalhe)", padrao: /COBRANCA|FATURA|PAYMENT/ },
] as const;

export type TipoTaxa = (typeof TIPOS_TAXA)[number]["id"] | "outras";

export function tipoDaTaxa(descricaoNormalizada: string): TipoTaxa {
  return TIPOS_TAXA.find((t) => t.padrao.test(descricaoNormalizada))?.id ?? "outras";
}

export const NOME_TIPO_TAXA: Record<TipoTaxa, string> = {
  ...(Object.fromEntries(TIPOS_TAXA.map((t) => [t.id, t.nome])) as Record<(typeof TIPOS_TAXA)[number]["id"], string>),
  outras: "Outras taxas e tarifas",
};

const EH_TAXA = /\bTAXA|\bTARIFA|\bFEE\b|MENSALIDADE|ANUIDADE/;

export interface TaxaLancada {
  id: number;
  data: string;
  descricao: string;
  conta: string;
  tipo: TipoTaxa;
  /** Positivo = custo (uma devolução de taxa entra negativa). */
  valorCentavos: number;
}

export interface ResumoTaxas {
  meses: string[];
  total12Centavos: number;
  mesAtualCentavos: number;
  mediaMensalCentavos: number;
  /** Peso das taxas na receita bruta dos 12 meses (null sem receita). */
  percentualDaReceita: number | null;
  porMes: { mes: string; totalCentavos: number; porTipo: Partial<Record<TipoTaxa, number>> }[];
  porTipo: { tipo: TipoTaxa; nome: string; totalCentavos: number; quantidade: number; mediaCentavos: number }[];
  lancamentos: TaxaLancada[];
  /** Conferência: cobranças do Asaas recebidas no período, bruto − líquido (deve bater com as taxas de cobrança). */
  conferencia: { cobrancas: number; brutoMenosLiquidoCentavos: number };
}

export async function resumoTaxas(db: Db, meses = 12): Promise<ResumoTaxas> {
  const inicio = primeiroDoMes(-(meses - 1));
  const listaMeses = Array.from({ length: meses }, (_, i) => primeiroDoMes(i - meses + 1).slice(0, 7));
  const pj = await db.query.contas.findMany({ where: or(eq(contas.escopoPadrao, "PJ"), eq(contas.instituicaoId, "asaas")) });
  const apelidos = new Map(pj.map((c) => [c.id, c.apelido]));
  const linhas = pj.length
    ? await db
        .select({ id: transacoes.id, data: transacoes.data, descricao: transacoes.descricao, normalizada: transacoes.descricaoNormalizada, valor: transacoes.valorCentavos, contaId: transacoes.contaId, categoriaId: transacoes.categoriaId, natureza: transacoes.natureza })
        .from(transacoes)
        .where(and(inArray(transacoes.contaId, pj.map((c) => c.id)), gte(transacoes.data, inicio)))
    : [];
  const taxas: TaxaLancada[] = linhas
    .filter((l) => {
      if (["transferencia_interna", "pagamento_fatura", "retirada_socio", "pro_labore", "distribuicao_lucros", "aporte_socio", "investimento"].includes(l.natureza)) return false;
      // Entrada só conta como devolução de taxa (estorno); juros de empréstimo (pj_tarifas sem "taxa/tarifa") ficam de fora.
      if (Number(l.valor) > 0 && !/ESTORNO|DEVOLU|REEMBOLSO/.test(l.normalizada)) return false;
      return l.categoriaId === "pj_taxas_pagamento" || EH_TAXA.test(l.normalizada);
    })
    .map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, conta: apelidos.get(l.contaId) ?? "", tipo: tipoDaTaxa(l.normalizada), valorCentavos: -Number(l.valor) }))
    .sort((a, b) => b.data.localeCompare(a.data));

  const porMes = listaMeses.map((mes) => {
    const doMes = taxas.filter((t) => t.data.startsWith(mes));
    const porTipo: Partial<Record<TipoTaxa, number>> = {};
    for (const t of doMes) porTipo[t.tipo] = (porTipo[t.tipo] ?? 0) + t.valorCentavos;
    return { mes, totalCentavos: doMes.reduce((s, t) => s + t.valorCentavos, 0), porTipo };
  });
  const tipos = [...new Set(taxas.map((t) => t.tipo))];
  const porTipo = tipos
    .map((tipo) => {
      const doTipo = taxas.filter((t) => t.tipo === tipo);
      const total = doTipo.reduce((s, t) => s + t.valorCentavos, 0);
      const cobrancas = doTipo.filter((t) => t.valorCentavos > 0).length;
      return { tipo, nome: NOME_TIPO_TAXA[tipo], totalCentavos: total, quantidade: cobrancas, mediaCentavos: cobrancas ? Math.round(total / cobrancas) : 0 };
    })
    .sort((a, b) => b.totalCentavos - a.totalCentavos);
  const total12 = porMes.reduce((s, m) => s + m.totalCentavos, 0);
  const receita = (await receitaPorMes(db, meses)).serie.reduce((s, m) => s + m.valorCentavos, 0);
  const [conf] = await db
    .select({
      cobrancas: sql<number>`count(*)::int`,
      diferenca: sql<number>`coalesce(sum(${compromissos.valorCentavos} - ${compromissos.valorLiquidoCentavos}), 0)::bigint`,
    })
    .from(compromissos)
    .where(and(eq(compromissos.origem, "asaas"), eq(compromissos.tipo, "receber"), eq(compromissos.status, "pago"), gte(compromissos.dataPagamento, inicio), sql`${compromissos.valorLiquidoCentavos} is not null`));

  return {
    meses: listaMeses,
    total12Centavos: total12,
    mesAtualCentavos: porMes[porMes.length - 1]?.totalCentavos ?? 0,
    mediaMensalCentavos: Math.round(porMes.slice(0, -1).reduce((s, m) => s + m.totalCentavos, 0) / Math.max(1, meses - 1)),
    percentualDaReceita: receita > 0 ? total12 / receita : null,
    porMes,
    porTipo,
    lancamentos: taxas,
    conferencia: { cobrancas: conf?.cobrancas ?? 0, brutoMenosLiquidoCentavos: Number(conf?.diferenca ?? 0) },
  };
}
