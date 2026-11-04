/**
 * Formato normalizado que todo parser (OFX, CSV, PDF, imagem) deve produzir.
 * Valores monetários sempre em centavos (inteiro) para evitar erro de ponto flutuante.
 * Convenção de sinal: positivo = entrada de dinheiro, negativo = saída.
 * Em cartão de crédito: compra = negativo, pagamento/estorno = positivo.
 */

import type { Natureza } from "../naturezas";

export type FormatoArquivo = "ofx" | "csv" | "pdf" | "imagem" | "api" | "desconhecido";

export type TipoConta = "corrente" | "pagamento" | "poupanca" | "cartao_credito" | "investimento";

export type Escopo = "PF" | "PJ";

export interface TransacaoExtraida {
  /** Data no formato ISO (AAAA-MM-DD). */
  data: string;
  descricao: string;
  /** Centavos, com sinal (+ entrada / - saída). */
  valorCentavos: number;
  /** Identificador do banco quando existir (FITID no OFX). Usado para deduplicar. */
  idExterno?: string;
  /** Documento da contraparte (CPF/CNPJ) quando aparece no extrato. */
  documentoContraparte?: string;
  /** Nome da contraparte quando o extrato separa (ex.: Pix recebido de FULANO). */
  nomeContraparte?: string;
  /** Fatura de cartão: final do cartão que fez a compra (físico, virtual ou adicional), se a fatura separa. */
  finalCartao?: string;
  /** Parcela "3/10" em compras parceladas de cartão. */
  parcela?: { atual: number; total: number };
  /** Classificação já conhecida pela origem (integrações), gravada como heurística. */
  sugestao?: {
    escopo?: Escopo;
    categoriaId?: string;
    natureza?: Natureza;
    motivo: string;
  };
}

export interface ContaExtraida {
  tipo?: TipoConta;
  agencia?: string;
  numero?: string;
  /** Últimos dígitos do cartão, quando for fatura. */
  finalCartao?: string;
  /** Nome do titular como aparece no documento. */
  titular?: string;
  /** CPF ou CNPJ do titular, quando aparece. Indica PF/PJ. */
  documentoTitular?: string;
}

export interface ExtratoNormalizado {
  formato: FormatoArquivo;
  /** Identificador do catálogo de instituições (ver instituicoes/catalogo.ts). */
  instituicaoId?: string;
  /** Nome da instituição como lido do arquivo, mesmo quando não reconhecida no catálogo. */
  instituicaoNomeLido?: string;
  conta: ContaExtraida;
  periodo?: { inicio: string; fim: string };
  saldoFinalCentavos?: number;
  moeda: string;
  transacoes: TransacaoExtraida[];
  /** Fatura de cartão: vencimento e total a pagar, quando o documento informa. */
  fatura?: { vencimento: string; fechamento?: string; totalCentavos: number; minimoCentavos?: number };
  /** Avisos não fatais (linhas ignoradas, campos ausentes etc.). */
  avisos: string[];
  /** Quem fez a extração: parser determinístico ou IA. */
  extraidoPor: "parser" | "ia";
}

export class ErroImportacao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroImportacao";
  }
}
