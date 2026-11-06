/**
 * Apuração mensal estimada (por competência): o que vai ser pago no dia 20 do mês seguinte.
 *
 * - DAS do Simples: receita bruta das notas emitidas no mês × alíquota efetiva. A alíquota vem do
 *   RBT12 (receita dos 12 meses anteriores ao mês) e do anexo (III ou V, pelo Fator R daquele mês).
 *   Nas notas com ISS retido pelo cliente, a parte do ISS sai do DAS (ela já foi recolhida).
 * - INSS do pró-labore: 11% do pró-labore do mês (contribuinte individual), recolhido pela empresa.
 *   A contribuição patronal (CPP) dos Anexos III e V já está dentro do DAS.
 * - Mês de MEI: o DAS é fixo (boleto do PGMEI), sem cálculo sobre as notas.
 *
 * Vencimento: dia 20 do mês seguinte; caindo em fim de semana ou feriado nacional, antecipa para o
 * dia útil anterior (regra do DAS e da DCTFWeb). É uma estimativa: o oficial é o PGDAS-D.
 */
import { aliquotaEfetiva, fatorR, INSS_PRO_LABORE, LIMITE_FATOR_R, TABELAS, type AnexoServico } from "./simples";

/** Feriados nacionais de data fixa (MM-DD). Os móveis (Carnaval, Sexta Santa) não mexem no dia 20. */
const FERIADOS_FIXOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

function deslocar(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Dia 20 do mês seguinte à competência, antecipado para dia útil. */
export function vencimentoDoImposto(competencia: string): string {
  const [a, m] = deslocar(competencia, 1).split("-").map(Number);
  let d = new Date(Date.UTC(a, m - 1, 20));
  for (;;) {
    const semana = d.getUTCDay();
    const mmdd = d.toISOString().slice(5, 10);
    if (semana !== 0 && semana !== 6 && !FERIADOS_FIXOS.has(mmdd)) break;
    d = new Date(d.getTime() - 86_400_000);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Parte do ISS dentro do DAS, por faixa (LC 123/2006, Anexos III e V, partilha dos tributos).
 * Usada para tirar do DAS o ISS das notas em que o cliente reteve o imposto.
 */
const PARTILHA_ISS: Record<AnexoServico, number[]> = {
  III: [0.335, 0.32, 0.325, 0.325, 0.335, 0],
  V: [0.14, 0.17, 0.19, 0.21, 0.235, 0],
};

export function partilhaIss(anexo: AnexoServico, rbt12Centavos: number): number {
  const i = TABELAS[anexo].findIndex((f) => rbt12Centavos <= f.ate);
  return PARTILHA_ISS[anexo][i < 0 ? PARTILHA_ISS[anexo].length - 1 : i];
}

export interface DadosCompetencia {
  competencia: string;
  regime: "mei" | "simples";
  /** Receita bruta (notas autorizadas) do mês. */
  receitaCentavos: number;
  /** Parte da receita em notas com ISS retido pelo cliente. */
  receitaIssRetidoCentavos: number;
  quantidadeNotas: number;
  /** Receita dos 12 meses anteriores (inclui o período MEI: mesmo CNPJ). */
  rbt12Centavos: number;
  /** Pró-labore somado nos 12 meses anteriores (folha do Fator R). */
  folha12Centavos: number;
  /** Pró-labore do mês (0 se ainda não havia). */
  proLaboreCentavos: number;
  sujeitoFatorR: boolean;
}

export interface ApuracaoCompetencia {
  competencia: string;
  regime: "mei" | "simples";
  vencimento: string;
  receitaCentavos: number;
  quantidadeNotas: number;
  rbt12Centavos: number;
  fatorR: number | null;
  anexo: AnexoServico | null;
  aliquotaEfetiva: number | null;
  /** ISS que saiu do DAS por já ter sido retido pelo cliente. */
  issRetidoDeduzidoCentavos: number;
  /** null em mês de MEI (valor fixo do boleto). */
  dasCentavos: number | null;
  inssCentavos: number;
}

export function apurarCompetencia(d: DadosCompetencia): ApuracaoCompetencia {
  const vencimento = vencimentoDoImposto(d.competencia);
  if (d.regime === "mei") {
    return {
      competencia: d.competencia, regime: "mei", vencimento, receitaCentavos: d.receitaCentavos, quantidadeNotas: d.quantidadeNotas,
      rbt12Centavos: d.rbt12Centavos, fatorR: null, anexo: null, aliquotaEfetiva: null, issRetidoDeduzidoCentavos: 0, dasCentavos: null, inssCentavos: 0,
    };
  }
  const fr = d.sujeitoFatorR ? fatorR(d.folha12Centavos, d.rbt12Centavos) : null;
  const anexo: AnexoServico = !d.sujeitoFatorR || (fr ?? 0) >= LIMITE_FATOR_R ? "III" : "V";
  // Sem receita anterior (início), vale a primeira faixa.
  const aliquota = aliquotaEfetiva(anexo, d.rbt12Centavos);
  const issDeduzido = Math.round(d.receitaIssRetidoCentavos * aliquota * partilhaIss(anexo, d.rbt12Centavos));
  const das = Math.max(0, Math.round(d.receitaCentavos * aliquota) - issDeduzido);
  return {
    competencia: d.competencia,
    regime: "simples",
    vencimento,
    receitaCentavos: d.receitaCentavos,
    quantidadeNotas: d.quantidadeNotas,
    rbt12Centavos: d.rbt12Centavos,
    fatorR: fr,
    anexo,
    aliquotaEfetiva: aliquota,
    issRetidoDeduzidoCentavos: issDeduzido,
    dasCentavos: das,
    inssCentavos: Math.round(d.proLaboreCentavos * INSS_PRO_LABORE),
  };
}

export { deslocar as deslocarCompetencia };
