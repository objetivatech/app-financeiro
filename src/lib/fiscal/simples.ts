/**
 * Cálculos do Simples Nacional para serviços (Anexos III e V) e Fator R.
 *
 * Fonte: LC 123/2006 com redação da LC 155/2016 (tabelas vigentes desde 2018).
 * Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12.
 * Fator R = folha de salários dos últimos 12 meses (inclui pró-labore) ÷ RBT12.
 * Atividades sujeitas ao Fator R vão para o Anexo III quando Fator R ≥ 28%; senão, Anexo V.
 *
 * Valores em centavos. Isto é uma estimativa para planejamento: o cálculo oficial é do PGDAS-D
 * (feito pela contabilidade) e pode ter particularidades (ex.: ISS fixo, receitas de outros anexos).
 */

export type AnexoServico = "III" | "V";

interface Faixa {
  /** Limite superior da RBT12 em centavos. */
  ate: number;
  /** Alíquota nominal (fração). */
  aliquota: number;
  /** Parcela a deduzir em centavos. */
  deduzir: number;
}

const R = (reais: number) => Math.round(reais * 100);

export const TABELAS: Record<AnexoServico, Faixa[]> = {
  III: [
    { ate: R(180_000), aliquota: 0.06, deduzir: 0 },
    { ate: R(360_000), aliquota: 0.112, deduzir: R(9_360) },
    { ate: R(720_000), aliquota: 0.135, deduzir: R(17_640) },
    { ate: R(1_800_000), aliquota: 0.16, deduzir: R(35_640) },
    { ate: R(3_600_000), aliquota: 0.21, deduzir: R(125_640) },
    { ate: R(4_800_000), aliquota: 0.33, deduzir: R(648_000) },
  ],
  V: [
    { ate: R(180_000), aliquota: 0.155, deduzir: 0 },
    { ate: R(360_000), aliquota: 0.18, deduzir: R(4_500) },
    { ate: R(720_000), aliquota: 0.195, deduzir: R(9_900) },
    { ate: R(1_800_000), aliquota: 0.205, deduzir: R(17_100) },
    { ate: R(3_600_000), aliquota: 0.23, deduzir: R(62_100) },
    { ate: R(4_800_000), aliquota: 0.305, deduzir: R(540_000) },
  ],
};

export const LIMITE_FATOR_R = 0.28;
/** Alíquota de INSS do contribuinte individual descontada do pró-labore. */
export const INSS_PRO_LABORE = 0.11;

/** Alíquota efetiva para a receita bruta dos últimos 12 meses (fração). Em início de atividade use RBT12 proporcional. */
export function aliquotaEfetiva(anexo: AnexoServico, rbt12Centavos: number): number {
  if (rbt12Centavos <= 0) return TABELAS[anexo][0].aliquota;
  const faixa = TABELAS[anexo].find((f) => rbt12Centavos <= f.ate) ?? TABELAS[anexo][TABELAS[anexo].length - 1];
  return (rbt12Centavos * faixa.aliquota - faixa.deduzir) / rbt12Centavos;
}

/**
 * Folha de 12 meses usada no Fator R. Com os 12 meses anteriores completos, é a soma deles. Com
 * menos (início de atividade, inclusive quem acabou de sair do MEI, que não tem pró-labore), vale a
 * média dos meses com folha × 12; e, no primeiro mês de folha, a do próprio mês × 12. Foi assim que o
 * PGDAS-D apurou set/2026 da empresa (Anexo III com só um mês de pró-labore).
 */
export function folhaDoFatorR(folhasAnteriores: number[], folhaDoMesCentavos: number): number {
  const comFolha = folhasAnteriores.filter((f) => f > 0);
  if (comFolha.length >= 12) return comFolha.reduce((t, f) => t + f, 0);
  if (comFolha.length > 0) return Math.round((comFolha.reduce((t, f) => t + f, 0) / comFolha.length) * 12);
  return folhaDoMesCentavos * 12;
}

export function fatorR(folha12Centavos: number, rbt12Centavos: number): number {
  if (rbt12Centavos <= 0) return 0;
  return folha12Centavos / rbt12Centavos;
}

export interface DiagnosticoFatorR {
  rbt12Centavos: number;
  folha12Centavos: number;
  fatorR: number;
  anexo: AnexoServico;
  aliquotaEfetiva: number;
  /** DAS estimado sobre a receita do mês informado. */
  dasEstimadoCentavos: number;
  /** Quanto o DAS seria no outro anexo, para comparar. */
  dasNoOutroAnexoCentavos: number;
  /** Pró-labore mensal mínimo para manter Fator R ≥ 28% com a RBT12 atual. */
  proLaboreMinimoCentavos: number;
  /** Até quanto a receita média mensal pode subir mantendo o Fator R com o pró-labore atual. */
  receitaMensalMaximaCentavos: number;
}

/**
 * Diagnóstico para atividades sujeitas ao Fator R (ex.: marketing/publicidade, desenvolvimento de software).
 * `proLaboreMensal` é usado para o cálculo do pró-labore mínimo e da receita máxima.
 */
export function diagnosticarFatorR(params: {
  rbt12Centavos: number;
  folha12Centavos: number;
  receitaDoMesCentavos: number;
  proLaboreMensalCentavos: number;
}): DiagnosticoFatorR {
  const { rbt12Centavos, folha12Centavos, receitaDoMesCentavos, proLaboreMensalCentavos } = params;
  const r = fatorR(folha12Centavos, rbt12Centavos);
  const anexo: AnexoServico = r >= LIMITE_FATOR_R ? "III" : "V";
  const outro: AnexoServico = anexo === "III" ? "V" : "III";
  const efetiva = aliquotaEfetiva(anexo, rbt12Centavos);
  return {
    rbt12Centavos,
    folha12Centavos,
    fatorR: r,
    anexo,
    aliquotaEfetiva: efetiva,
    dasEstimadoCentavos: Math.round(receitaDoMesCentavos * efetiva),
    dasNoOutroAnexoCentavos: Math.round(receitaDoMesCentavos * aliquotaEfetiva(outro, rbt12Centavos)),
    // Contas em inteiros (28% = 28/100) para não sofrer com arredondamento de ponto flutuante.
    proLaboreMinimoCentavos: Math.ceil((rbt12Centavos * 28) / 1200),
    receitaMensalMaximaCentavos: Math.floor((proLaboreMensalCentavos * 100) / 28),
  };
}
