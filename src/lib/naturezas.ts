/**
 * Natureza da movimentação do ponto de vista PF x PJ. É o coração do app:
 * separa o que é dinheiro da empresa, do sócio, e o que é só dinheiro trocando de bolso.
 * (Arquivo sem dependências para poder ser usado também em componentes de cliente.)
 */
export const NATUREZAS = [
  "comum",
  "transferencia_interna",
  "retirada_socio",
  "pro_labore",
  "distribuicao_lucros",
  "aporte_socio",
  "despesa_pessoal_na_pj",
  "despesa_pj_na_pf",
  "pagamento_fatura",
  "imposto",
  "estorno",
  "investimento",
] as const;
export type Natureza = (typeof NATUREZAS)[number];
