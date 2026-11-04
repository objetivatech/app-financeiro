/**
 * Simulações que o consultor usa para responder "e se...?" com números (puras, em centavos).
 * A IA não faz conta de cabeça: chama estas funções pelas ferramentas.
 */
import { aliquotaEfetiva, fatorR as calcularFatorR, LIMITE_FATOR_R, type AnexoServico } from "../fiscal/simples";
import { REFERENCIAS as R } from "./referencias";

/** Parcela pela Tabela Price. */
export function parcelaPrice(principalCentavos: number, taxaMensal: number, meses: number): number {
  if (meses <= 0) return principalCentavos;
  if (taxaMensal <= 0) return Math.round(principalCentavos / meses);
  return Math.round((principalCentavos * taxaMensal) / (1 - Math.pow(1 + taxaMensal, -meses)));
}

export interface ResultadoFinanciamento {
  financiadoCentavos: number;
  parcelaCentavos: number;
  totalPagoCentavos: number;
  jurosTotaisCentavos: number;
  entradaPercentual: number;
  /** Custo mensal de ter o bem (parcela + seguro + IPVA + manutenção + combustível). */
  custoMensalTotalCentavos: number;
  parcelaSobreRenda: number | null;
  custoSobreRenda: number | null;
  comprometimentoComParcelasAtuais: number | null;
  avaliacao: string[];
}

export function simularFinanciamento(p: {
  valorBemCentavos: number;
  entradaCentavos: number;
  taxaMensal: number;
  meses: number;
  rendaMensalCentavos?: number;
  parcelasAtuaisCentavos?: number;
  seguroAnualCentavos?: number;
  /** Fração do valor do bem por ano (IPVA no RS: cerca de 3%). */
  ipvaAnual?: number;
  manutencaoMensalCentavos?: number;
  combustivelMensalCentavos?: number;
}): ResultadoFinanciamento {
  const financiado = Math.max(0, p.valorBemCentavos - p.entradaCentavos);
  const parcela = parcelaPrice(financiado, p.taxaMensal, p.meses);
  const total = parcela * p.meses;
  const custoMensal =
    parcela +
    Math.round((p.seguroAnualCentavos ?? 0) / 12) +
    Math.round((p.valorBemCentavos * (p.ipvaAnual ?? 0)) / 12) +
    (p.manutencaoMensalCentavos ?? 0) +
    (p.combustivelMensalCentavos ?? 0);
  const renda = p.rendaMensalCentavos ?? 0;
  const entradaPercentual = p.valorBemCentavos > 0 ? p.entradaCentavos / p.valorBemCentavos : 0;
  const avaliacao: string[] = [];
  avaliacao.push(
    entradaPercentual >= R.entradaMinima
      ? `Entrada de ${Math.round(entradaPercentual * 100)}%: dentro da referência (≥ ${R.entradaMinima * 100}%).`
      : `Entrada de ${Math.round(entradaPercentual * 100)}%: abaixo da referência de ${R.entradaMinima * 100}%.`,
  );
  if (renda > 0) {
    const pr = parcela / renda;
    avaliacao.push(
      pr <= R.parcelaGrandeMaxRenda
        ? `Parcela = ${Math.round(pr * 100)}% da renda: cabe (referência ≤ ${R.parcelaGrandeMaxRenda * 100}%).`
        : `Parcela = ${Math.round(pr * 100)}% da renda: acima da referência de ${R.parcelaGrandeMaxRenda * 100}%.`,
    );
    const total = (parcela + (p.parcelasAtuaisCentavos ?? 0)) / renda;
    avaliacao.push(
      total <= R.comprometimentoSaudavel
        ? `Com as parcelas atuais, ${Math.round(total * 100)}% da renda fica comprometida: ok (≤ ${R.comprometimentoSaudavel * 100}%).`
        : `Com as parcelas atuais, ${Math.round(total * 100)}% da renda fica comprometida: acima do saudável (${R.comprometimentoSaudavel * 100}%).`,
    );
  }
  if (p.meses > 48) avaliacao.push("Prazo acima de 48 meses: os juros pesam muito; prefira encurtar.");
  return {
    financiadoCentavos: financiado,
    parcelaCentavos: parcela,
    totalPagoCentavos: total,
    jurosTotaisCentavos: total - financiado,
    entradaPercentual,
    custoMensalTotalCentavos: custoMensal,
    parcelaSobreRenda: renda > 0 ? parcela / renda : null,
    custoSobreRenda: renda > 0 ? custoMensal / renda : null,
    comprometimentoComParcelasAtuais: renda > 0 ? (parcela + (p.parcelasAtuaisCentavos ?? 0)) / renda : null,
    avaliacao,
  };
}

export interface CenarioProLabore {
  proLaboreCentavos: number;
  fatorR: number;
  anexo: AnexoServico;
  aliquotaEfetiva: number;
  dasMensalCentavos: number;
  /** INSS do sócio (11% do pró-labore, sem considerar o teto). */
  inssCentavos: number;
  /** DAS + INSS: o custo tributário mensal ligado à decisão (sem IR da PF). */
  custoMensalCentavos: number;
}

/**
 * Compara o pró-labore atual com outro valor: Fator R, anexo, DAS sobre a receita média e INSS.
 * Simplificação: considera que o novo pró-labore valeria para os 12 meses (efeito pleno). O IR
 * da PF sobre o pró-labore não entra (depende de deduções): fica como ponto para a contabilidade.
 */
export function simularProLabore(p: { rbt12Centavos: number; receitaMensalMediaCentavos: number; proLaboreAtualCentavos: number; proLaboreNovoCentavos: number }): {
  atual: CenarioProLabore;
  novo: CenarioProLabore;
  diferencaMensalCentavos: number;
  proLaboreMinimoCentavos: number;
} {
  const cenario = (pl: number): CenarioProLabore => {
    const r = calcularFatorR(pl * 12, p.rbt12Centavos);
    const anexo: AnexoServico = r >= LIMITE_FATOR_R ? "III" : "V";
    const aliquota = aliquotaEfetiva(anexo, p.rbt12Centavos);
    const das = Math.round(p.receitaMensalMediaCentavos * aliquota);
    const inss = Math.round(pl * 0.11);
    return { proLaboreCentavos: pl, fatorR: r, anexo, aliquotaEfetiva: aliquota, dasMensalCentavos: das, inssCentavos: inss, custoMensalCentavos: das + inss };
  };
  const atual = cenario(p.proLaboreAtualCentavos);
  const novo = cenario(p.proLaboreNovoCentavos);
  return {
    atual,
    novo,
    diferencaMensalCentavos: novo.custoMensalCentavos - atual.custoMensalCentavos,
    proLaboreMinimoCentavos: Math.ceil((p.rbt12Centavos * 28) / 1200),
  };
}

export interface DividaParaQuitar {
  nome: string;
  restanteCentavos: number;
  parcelaCentavos: number;
  parcelasRestantes: number;
  taxaMensal: number | null;
  temConsequenciaGrave: boolean;
}

/** Quita um saldo pagando `pagamento` por mês a juros `i`: meses e total pago (a última parcela é só o que falta). */
function quitar(saldo: number, pagamento: number, i: number): { meses: number; totalPago: number } | null {
  if (saldo <= 0) return { meses: 0, totalPago: 0 };
  if (pagamento <= saldo * i) return null; // os juros comem o pagamento: nunca quita
  let s = saldo;
  let meses = 0;
  let total = 0;
  while (s > 0 && meses < 600) {
    s = s * (1 + i);
    const paga = Math.min(pagamento, s);
    s -= paga;
    total += paga;
    meses++;
  }
  return { meses, totalPago: Math.round(total) };
}

/**
 * Estratégia avalanche: ordem de quitação e o efeito de colocar um valor extra por mês (e/ou um
 * aporte único) na primeira dívida da fila. Dívidas com consequência grave de atraso vêm antes
 * como "manter em dia", nunca como alvo de atraso.
 */
export function simularQuitacao(dividas: DividaParaQuitar[], extraMensalCentavos: number, aporteUnicoCentavos = 0) {
  const ordem = [...dividas]
    .filter((d) => d.restanteCentavos > 0)
    .sort((a, b) => (b.taxaMensal ?? 0) - (a.taxaMensal ?? 0) || a.restanteCentavos - b.restanteCentavos);
  const alvo = ordem[0];
  if (!alvo) return { ordem: [], alvo: null };
  const i = alvo.taxaMensal ?? 0;
  // Saldo devedor de hoje = valor presente das parcelas que faltam.
  const saldo = i > 0 ? Math.round((alvo.parcelaCentavos * (1 - Math.pow(1 + i, -alvo.parcelasRestantes))) / i) : alvo.restanteCentavos;
  const saldoAposAporte = Math.max(0, saldo - aporteUnicoCentavos);
  const mesesHoje = alvo.parcelasRestantes;
  const pagoHoje = alvo.parcelaCentavos * mesesHoje;
  const novo = quitar(saldoAposAporte, alvo.parcelaCentavos + extraMensalCentavos, i);
  const mesesNovo = novo?.meses ?? mesesHoje;
  const pagoNovo = novo ? Math.min(pagoHoje, aporteUnicoCentavos + novo.totalPago) : pagoHoje;
  return {
    ordem: ordem.map((d, n) => ({
      posicao: n + 1,
      nome: d.nome,
      taxaMensal: d.taxaMensal,
      restanteCentavos: d.restanteCentavos,
      observacao: d.temConsequenciaGrave ? "Manter sempre em dia (atraso tem consequência grave)" : null,
    })),
    alvo: {
      nome: alvo.nome,
      saldoDevedorEstimadoCentavos: saldo,
      mesesSemExtra: mesesHoje,
      mesesComExtra: mesesNovo,
      mesesAMenos: Math.max(0, mesesHoje - mesesNovo),
      economiaEstimadaCentavos: Math.max(0, pagoHoje - pagoNovo),
      semTaxaConhecida: alvo.taxaMensal === null,
    },
  };
}

/** Quanto tempo para juntar um valor, ou quanto guardar por mês para chegar no prazo. */
export function simularMeta(p: { valorMetaCentavos: number; jaGuardadoCentavos?: number; aporteMensalCentavos?: number; prazoMeses?: number; rendimentoMensal?: number }) {
  const i = p.rendimentoMensal ?? 0.008;
  const pv = p.jaGuardadoCentavos ?? 0;
  const falta = p.valorMetaCentavos - pv;
  if (falta <= 0) return { meses: 0, aporteNecessarioCentavos: 0, mensagem: "A meta já está atingida." };
  let meses: number | null = null;
  if (p.aporteMensalCentavos && p.aporteMensalCentavos > 0) {
    let saldo = pv;
    meses = 0;
    while (saldo < p.valorMetaCentavos && meses < 600) {
      saldo = saldo * (1 + i) + p.aporteMensalCentavos;
      meses++;
    }
  }
  let aporteNecessario: number | null = null;
  if (p.prazoMeses && p.prazoMeses > 0) {
    const fvPv = pv * Math.pow(1 + i, p.prazoMeses);
    const fator = i > 0 ? (Math.pow(1 + i, p.prazoMeses) - 1) / i : p.prazoMeses;
    aporteNecessario = Math.max(0, Math.ceil((p.valorMetaCentavos - fvPv) / fator));
  }
  return { meses, aporteNecessarioCentavos: aporteNecessario, rendimentoMensalUsado: i };
}
