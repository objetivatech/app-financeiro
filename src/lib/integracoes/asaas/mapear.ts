import type { ExtratoNormalizado, TransacaoExtraida } from "../../importacao/tipos";
import type { AsaasCobranca, AsaasLancamento, AsaasNota, AsaasStatusCobranca } from "./cliente";

/** Converte reais (número com até 2 casas, como a API devolve) para centavos. */
export function centavos(valor: number | undefined): number {
  return Math.round((valor ?? 0) * 100);
}

/** Datas da API vêm como "AAAA-MM-DD" (às vezes com hora). */
export function dia(data: string | undefined): string | null {
  return data && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null;
}

const PAGOS: AsaasStatusCobranca[] = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"];
const CANCELADOS: AsaasStatusCobranca[] = [
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
];

export function statusDaCobranca(c: AsaasCobranca, hoje: string): "aberto" | "vencido" | "pago" | "cancelado" {
  if (c.deleted) return "cancelado";
  const s = c.status ?? "PENDING";
  if (PAGOS.includes(s)) return "pago";
  if (CANCELADOS.includes(s)) return "cancelado";
  if (s === "OVERDUE" || s === "DUNNING_REQUESTED") return "vencido";
  const venc = dia(c.dueDate);
  return venc && venc < hoje ? "vencido" : "aberto";
}

const FORMAS: Record<string, string> = {
  BOLETO: "boleto",
  PIX: "pix",
  CREDIT_CARD: "cartão de crédito",
  DEBIT_CARD: "cartão de débito",
  TRANSFER: "transferência",
  DEPOSIT: "depósito",
  UNDEFINED: "a escolher pelo cliente",
};

export function formaDePagamento(billingType: string | undefined): string | null {
  return billingType ? (FORMAS[billingType] ?? billingType.toLowerCase()) : null;
}

/** Campos de `compromissos` derivados de uma cobrança do Asaas (falta só clienteId e contaId). */
export function compromissoDaCobranca(c: AsaasCobranca, hoje: string) {
  const status = statusDaCobranca(c, hoje);
  return {
    tipo: "receber" as const,
    escopo: "PJ" as const,
    descricao: c.description?.trim() || "Cobrança Asaas",
    valorCentavos: centavos(c.value),
    valorLiquidoCentavos: c.netValue !== undefined ? centavos(c.netValue) : null,
    vencimento: dia(c.dueDate) ?? hoje,
    status,
    dataPagamento: status === "pago" ? (dia(c.clientPaymentDate) ?? dia(c.paymentDate)) : null,
    dataCredito: status === "pago" ? (dia(c.creditDate) ?? dia(c.estimatedCreditDate)) : null,
    formaPagamento: formaDePagamento(c.billingType),
    categoriaId: "pj_receita",
    origem: "asaas",
    idExterno: c.id,
    statusOriginal: c.deleted ? "DELETED" : (c.status ?? null),
    link: c.invoiceUrl ?? null,
    parcelaAtual: c.installment ? (c.installmentNumber ?? null) : null,
  };
}

export function notaDoAsaas(n: AsaasNota) {
  const emissao = dia(n.effectiveDate);
  if (!emissao) return null;
  return {
    origem: "asaas",
    idExterno: n.id,
    numero: n.number ?? null,
    status: n.status ?? "SCHEDULED",
    valorCentavos: centavos(n.value),
    dataEmissao: emissao,
    codigoServico: n.municipalServiceCode ?? null,
    descricaoServico: n.serviceDescription ?? null,
    pdfUrl: n.pdfUrl ?? null,
  };
}

/**
 * O que já sabemos de um lançamento do extrato do Asaas pelo tipo dele.
 * Transferências e Pix ficam sem sugestão: podem ser entre contas próprias (o motor pareia)
 * ou pagamentos a terceiros (a IA classifica).
 */
export function sugestaoDoLancamento(tipo: string | undefined): TransacaoExtraida["sugestao"] {
  if (!tipo) return undefined;
  if (tipo === "PAYMENT_RECEIVED" || tipo === "PARTIAL_PAYMENT" || tipo === "RECEIVABLE_ANTICIPATION_GROSS_CREDIT") {
    return { escopo: "PJ", categoriaId: "pj_receita", motivo: "Cobrança recebida no Asaas" };
  }
  if (tipo === "ASAAS_CARD_BILL_PAYMENT") {
    return { escopo: "PJ", categoriaId: "mov_fatura", natureza: "pagamento_fatura", motivo: "Pagamento da fatura do cartão Asaas" };
  }
  if (tipo.includes("FEE") || tipo === "CONTRACTED_CUSTOMER_PLAN_FEE") {
    return { escopo: "PJ", categoriaId: "pj_taxas_pagamento", motivo: "Taxa do Asaas" };
  }
  if (tipo === "PAYMENT_REVERSAL" || tipo === "CHARGEBACK") {
    return { escopo: "PJ", categoriaId: "pj_receita", natureza: "estorno", motivo: "Estorno de cobrança no Asaas" };
  }
  return undefined;
}

/**
 * Transforma os lançamentos do extrato do Asaas no formato normalizado do app.
 * O Asaas devolve `value` com sinal (débitos negativos) e o saldo após cada lançamento;
 * conferimos a sequência de saldos e avisamos se algo não fecha.
 */
export function extratoDoAsaas(lancamentos: AsaasLancamento[], periodo: { inicio: string; fim: string }): ExtratoNormalizado {
  const avisos: string[] = [];
  const transacoes: TransacaoExtraida[] = [];
  let saldoAnterior: number | undefined;
  for (const l of lancamentos) {
    const data = dia(l.date);
    if (!data || l.value === undefined) {
      avisos.push(`Lançamento ${l.id} ignorado: sem data ou valor.`);
      continue;
    }
    const valor = centavos(l.value);
    if (saldoAnterior !== undefined && l.balance !== undefined && centavos(l.balance) !== saldoAnterior + valor) {
      avisos.push(`Saldo não fecha no lançamento ${l.id} (${data}). Confira o extrato no Asaas.`);
    }
    if (l.balance !== undefined) saldoAnterior = centavos(l.balance);
    transacoes.push({
      data,
      descricao: l.description?.trim() || l.type || "Lançamento Asaas",
      valorCentavos: valor,
      idExterno: l.id,
      sugestao: sugestaoDoLancamento(l.type),
    });
  }
  const ultimo = lancamentos.at(-1);
  return {
    formato: "api",
    instituicaoId: "asaas",
    instituicaoNomeLido: "Asaas",
    conta: { tipo: "pagamento" },
    periodo,
    saldoFinalCentavos: ultimo?.balance !== undefined ? centavos(ultimo.balance) : undefined,
    moeda: "BRL",
    transacoes,
    avisos,
    extraidoPor: "parser",
  };
}
