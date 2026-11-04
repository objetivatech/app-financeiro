import Papa from "papaparse";
import type { Escopo, ExtratoNormalizado, TransacaoExtraida } from "../../importacao/tipos";
import { normalizarTexto, parseData, parseValorCentavos } from "../../importacao/util";
import type { MpPagamento } from "./cliente";

const centavos = (v: number | undefined | null) => Math.round((v ?? 0) * 100);
const dia = (iso: string | null | undefined) => (iso ? parseData(iso) : null);

/** Situação de um pagamento recebido no Mercado Pago, no vocabulário de contas a receber. */
export function statusDoPagamento(p: MpPagamento, hoje: string): "aberto" | "vencido" | "pago" | "cancelado" | null {
  switch (p.status) {
    case "approved":
    case "authorized":
      return "pago";
    case "pending":
    case "in_process":
    case "in_mediation": {
      const venc = dia(p.date_of_expiration);
      return venc && venc < hoje ? "vencido" : "aberto";
    }
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "cancelado";
    default:
      return null; // rejected e afins: nunca foi dinheiro a receber
  }
}

/** Pagamento recebido → compromisso "a receber" (origem mercadopago), ou null se não interessa. */
export function compromissoDoPagamento(p: MpPagamento, hoje: string, escopo: Escopo) {
  const status = statusDoPagamento(p, hoje);
  if (!status || p.id === undefined) return null;
  const vencimento = dia(p.date_of_expiration) ?? dia(p.date_created) ?? hoje;
  const pagador = [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(" ");
  return {
    tipo: "receber" as const,
    escopo,
    descricao: (p.description?.trim() || (pagador ? `Pagamento de ${pagador}` : "Pagamento recebido no Mercado Pago")).slice(0, 200),
    valorCentavos: centavos(p.transaction_amount),
    valorLiquidoCentavos: p.transaction_details?.net_received_amount !== undefined ? centavos(p.transaction_details.net_received_amount) : null,
    vencimento,
    status,
    dataPagamento: status === "pago" ? dia(p.date_approved) : null,
    dataCredito: status === "pago" ? dia(p.money_release_date) : null,
    formaPagamento: p.payment_type_id ?? p.payment_method_id ?? null,
    origem: "mercadopago",
    idExterno: String(p.id),
    statusOriginal: p.status ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Relatório de Liberações (release report): o extrato do saldo disponível da conta.
// ---------------------------------------------------------------------------------------------

/** Colunas que usamos, com os nomes em inglês (padrão da API) e traduções possíveis. */
const COLUNAS = {
  data: ["DATE", "DATA"],
  id: ["SOURCE_ID", "ID DA OPERACAO", "ID DA OPERACAO NO MERCADO PAGO"],
  ref: ["EXTERNAL_REFERENCE", "REFERENCIA EXTERNA"],
  tipoRegistro: ["RECORD_TYPE", "TIPO DE REGISTRO"],
  descricao: ["DESCRIPTION", "DESCRICAO"],
  credito: ["NET_CREDIT_AMOUNT", "NET_CREDIT", "VALOR LIQUIDO CREDITADO", "CREDITO LIQUIDO"],
  debito: ["NET_DEBIT_AMOUNT", "NET_DEBIT", "VALOR LIQUIDO DEBITADO", "DEBITO LIQUIDO"],
  meio: ["PAYMENT_METHOD", "MEIO DE PAGAMENTO"],
  saldo: ["BALANCE_AMOUNT", "SALDO"],
} as const;

/** Rótulos legíveis para os tipos de movimento do relatório. */
const ROTULOS: [RegExp, string][] = [
  [/^PAYMENT$|^PAGAMENTO$/, "Recebimento no Mercado Pago"],
  [/REFUND|ESTORNO|DEVOLUCAO/, "Devolução ao comprador"],
  [/CHARGEBACK|CONTESTACAO/, "Contestação (chargeback)"],
  [/DISPUTE|MEDIATION|RECLAMACAO/, "Reclamação/mediação"],
  [/WITHDRAWAL_CANCEL|PAYOUT_CANCEL/, "Saque cancelado"],
  [/WITHDRAWAL|PAYOUT|RETIRADA|SAQUE/, "Saque para conta bancária"],
  [/FEE|TARIFA/, "Tarifa do Mercado Pago"],
  [/SHIPPING|FRETE|ENVIO/, "Frete"],
  [/CREDIT|LOAN|EMPRESTIMO|CREDITO/, "Mercado Crédito"],
];

function rotulo(descricao: string): string {
  const d = normalizarTexto(descricao).replace(/[\s-]+/g, "_");
  return ROTULOS.find(([r]) => r.test(d))?.[1] ?? (descricao || "Movimento no Mercado Pago");
}

export function pareceRelatorioMercadoPago(texto: string): boolean {
  const cabecalho = normalizarTexto(texto.slice(0, 2000).split(/\r?\n/).find((l) => l.trim()) ?? "");
  return /SOURCE_ID/.test(cabecalho) && /NET_CREDIT|NET_DEBIT/.test(cabecalho);
}

/**
 * Lê o CSV do Relatório de Liberações (vindo da API ou baixado do painel do Mercado Pago).
 * Usa só as linhas de liberação (o que entrou ou saiu do saldo disponível); saldo inicial,
 * subtotais e bloqueios são ignorados. Valor = crédito líquido − débito líquido.
 */
export function lerRelatorioLiberacoes(texto: string, opcoes: { escopo?: Escopo | null } = {}): ExtratoNormalizado {
  const { data } = Papa.parse<string[]>(texto.replace(/^﻿/, "").trim(), { skipEmptyLines: "greedy", delimiter: "" });
  const linhas = data.map((l) => l.map((c) => (c ?? "").trim()));
  const cab = (linhas[0] ?? []).map((c) => normalizarTexto(c));
  const col = (nomes: readonly string[]) => cab.findIndex((c) => nomes.includes(c));
  const idx = Object.fromEntries(Object.entries(COLUNAS).map(([k, nomes]) => [k, col(nomes)])) as Record<keyof typeof COLUNAS, number>;
  const avisos: string[] = [];
  if (idx.data < 0 || (idx.credito < 0 && idx.debito < 0)) {
    return { formato: "csv", instituicaoId: "mercadopago", conta: { tipo: "pagamento" }, moeda: "BRL", transacoes: [], avisos: ["Cabeçalho do relatório do Mercado Pago não reconhecido."], extraidoPor: "parser" };
  }
  const transacoes: TransacaoExtraida[] = [];
  let saldoFinal: number | undefined;
  for (const linha of linhas.slice(1)) {
    const celula = (k: keyof typeof COLUNAS) => (idx[k] >= 0 ? (linha[idx[k]] ?? "") : "");
    const tipoRegistro = normalizarTexto(celula("tipoRegistro"));
    if (tipoRegistro && !/^(RELEASE|LIBERACAO|LIBERACOES)$/.test(tipoRegistro)) continue;
    const data = parseData(celula("data"));
    if (!data) continue;
    const credito = parseValorCentavos(celula("credito")) ?? 0;
    const debito = parseValorCentavos(celula("debito")) ?? 0;
    const valor = Math.abs(credito) - Math.abs(debito);
    if (valor === 0) continue;
    const descricaoBruta = celula("descricao");
    const nome = rotulo(descricaoBruta);
    const ref = celula("ref");
    const meio = celula("meio");
    const id = celula("id");
    const saldo = parseValorCentavos(celula("saldo"));
    if (saldo !== null) saldoFinal = saldo;
    const d = normalizarTexto(descricaoBruta);
    let sugestao: TransacaoExtraida["sugestao"];
    if (/FEE|TARIFA/.test(d) && valor < 0) {
      sugestao = opcoes.escopo === "PF" ? { escopo: "PF", categoriaId: "pf_juros_tarifas", motivo: "Tarifa do Mercado Pago" } : opcoes.escopo === "PJ" ? { escopo: "PJ", categoriaId: "pj_taxas_pagamento", motivo: "Tarifa do Mercado Pago" } : undefined;
    } else if (/^PAYMENT$|^PAGAMENTO$/.test(d) && valor > 0 && opcoes.escopo === "PJ") {
      sugestao = { escopo: "PJ", categoriaId: "pj_receita", motivo: "Recebimento no Mercado Pago" };
    } else if (/REFUND|CHARGEBACK|ESTORNO|DEVOLUCAO/.test(d) && valor < 0 && opcoes.escopo === "PJ") {
      sugestao = { escopo: "PJ", categoriaId: "pj_receita", natureza: "estorno", motivo: "Devolução de venda no Mercado Pago" };
    }
    transacoes.push({
      data,
      descricao: [nome, ref && `ref ${ref}`, meio && `(${meio})`].filter(Boolean).join(" · "),
      valorCentavos: valor,
      idExterno: id ? `${id}:${d || "MOV"}` : undefined,
      sugestao,
    });
  }
  const datas = transacoes.map((t) => t.data).sort();
  return {
    formato: "csv",
    instituicaoId: "mercadopago",
    conta: { tipo: "pagamento" },
    periodo: datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : undefined,
    saldoFinalCentavos: saldoFinal,
    moeda: "BRL",
    transacoes,
    avisos,
    extraidoPor: "parser",
  };
}
