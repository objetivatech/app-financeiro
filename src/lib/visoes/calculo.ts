/**
 * Visões PF, PJ e consolidada a partir das somas do mês (puro, sem banco).
 *
 * Princípios:
 * - Dinheiro trocando de bolso (entre contas próprias, pagamento de fatura, investimento) não é
 *   receita nem despesa. Compras no cartão contam na data da compra; o pagamento da fatura, não.
 * - O dinheiro que sai da empresa para você (pró-labore, lucros, retiradas, gastos pessoais pagos
 *   pela PJ) é saída da PJ e renda da PF. Gasto da empresa pago com dinheiro pessoal é despesa da PJ
 *   e, para a PF, um aporte na empresa.
 * - Assim, "ficou na empresa" + "sobrou para você" = resultado consolidado (as transferências se anulam).
 *
 * Todos os campos de `SomasDoMes` vêm com o sinal do extrato (+ entrada, − saída).
 */

export interface SomasDoMes {
  mes: string;
  /** PJ, natureza comum, entradas (exceto "outras receitas"). */
  pjReceitaServicos: number;
  pjOutrasReceitas: number;
  pjEstornos: number;
  /** PJ, saídas de impostos (DAS etc.). */
  pjImpostos: number;
  /** PJ, saídas de parcelas de dívidas e parcelamentos. */
  pjDividas: number;
  /** PJ, demais saídas comuns (inclui gastos da empresa pagos pela PF). */
  pjDespesas: number;
  /** Saídas da PJ para o sócio, por natureza (negativas). */
  saidaProLabore: number;
  saidaLucros: number;
  saidaRetirada: number;
  /** As mesmas naturezas vistas do lado da PF (positivas). */
  entradaProLabore: number;
  entradaLucros: number;
  entradaRetirada: number;
  /** Gastos pessoais pagos pela empresa (negativos). */
  pessoalNaPj: number;
  /** Gastos da empresa pagos pela PF (negativos). */
  pjNaPf: number;
  aporteSaidaPf: number;
  aporteEntradaPj: number;
  pfEntradas: number;
  pfEstornos: number;
  pfDividas: number;
  /** PF, demais saídas comuns (inclui impostos pessoais). */
  pfDespesas: number;
  /** Aplicações (−) e resgates (+) por escopo. */
  pfInvestimento: number;
  pjInvestimento: number;
}

export const SOMAS_ZERADAS: Omit<SomasDoMes, "mes"> = {
  pjReceitaServicos: 0,
  pjOutrasReceitas: 0,
  pjEstornos: 0,
  pjImpostos: 0,
  pjDividas: 0,
  pjDespesas: 0,
  saidaProLabore: 0,
  saidaLucros: 0,
  saidaRetirada: 0,
  entradaProLabore: 0,
  entradaLucros: 0,
  entradaRetirada: 0,
  pessoalNaPj: 0,
  pjNaPf: 0,
  aporteSaidaPf: 0,
  aporteEntradaPj: 0,
  pfEntradas: 0,
  pfEstornos: 0,
  pfDividas: 0,
  pfDespesas: 0,
  pfInvestimento: 0,
  pjInvestimento: 0,
};

/**
 * Valor de uma transferência entre PJ e PF. Se as duas contas foram importadas, as duas pernas
 * têm o mesmo valor; se só uma foi, vale a que existe. Por isso, o maior dos dois lados.
 */
function perna(saida: number, entrada: number): number {
  return Math.max(-saida, entrada, 0);
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export interface VisaoPJ {
  receitaServicos: number;
  outrasReceitas: number;
  receitaTotal: number;
  impostos: number;
  despesas: number;
  parcelasDividas: number;
  /** Receita − impostos − despesas − parcelas: o que a operação gerou antes de pagar o sócio. */
  resultadoOperacional: number;
  proLabore: number;
  lucros: number;
  retiradas: number;
  pessoalNaPj: number;
  paraOSocio: number;
  /** Gastos da empresa pagos com dinheiro pessoal. */
  pagoPeloSocio: number;
  /** Aportes do sócio + gastos da empresa pagos com dinheiro pessoal. */
  aportes: number;
  ficouNaEmpresa: number;
  investido: number;
  margem: number | null;
  pesoImpostos: number | null;
  /** Quanto do resultado foi para o sócio. */
  distribuido: number | null;
}

export function visaoPJ(s: SomasDoMes): VisaoPJ {
  const receitaTotal = s.pjReceitaServicos + s.pjOutrasReceitas;
  const impostos = -s.pjImpostos;
  const despesas = -s.pjDespesas - s.pjEstornos;
  const parcelasDividas = -s.pjDividas;
  const resultadoOperacional = receitaTotal - impostos - despesas - parcelasDividas;
  const proLabore = perna(s.saidaProLabore, s.entradaProLabore);
  const lucros = perna(s.saidaLucros, s.entradaLucros);
  const retiradas = perna(s.saidaRetirada, s.entradaRetirada);
  const pessoalNaPj = -s.pessoalNaPj;
  const paraOSocio = proLabore + lucros + retiradas + pessoalNaPj;
  const aportes = perna(s.aporteSaidaPf, s.aporteEntradaPj) - s.pjNaPf;
  return {
    receitaServicos: s.pjReceitaServicos,
    outrasReceitas: s.pjOutrasReceitas,
    receitaTotal,
    impostos,
    despesas,
    parcelasDividas,
    resultadoOperacional,
    proLabore,
    lucros,
    retiradas,
    pessoalNaPj,
    paraOSocio,
    pagoPeloSocio: -s.pjNaPf,
    aportes,
    ficouNaEmpresa: resultadoOperacional - paraOSocio + aportes,
    investido: -s.pjInvestimento,
    margem: div(resultadoOperacional, receitaTotal),
    pesoImpostos: div(impostos, receitaTotal),
    distribuido: resultadoOperacional > 0 ? paraOSocio / resultadoOperacional : null,
  };
}

export interface VisaoPF {
  /** Pró-labore + lucros + retiradas recebidos em dinheiro. */
  rendaDoNegocio: number;
  /** Gastos pessoais que a empresa pagou: renda "em espécie". */
  pagoPelaEmpresa: number;
  outrasRendas: number;
  rendaTotal: number;
  /** Despesas pessoais, inclusive as pagas pela empresa, já descontados estornos. */
  custoDeVida: number;
  parcelasDividas: number;
  /** Dinheiro pessoal que foi para a empresa (aportes + gastos da PJ pagos por você). */
  paraAEmpresa: number;
  sobra: number;
  investido: number;
  taxaPoupanca: number | null;
  comprometimentoDividas: number | null;
}

export function visaoPF(s: SomasDoMes): VisaoPF {
  const rendaDoNegocio = perna(s.saidaProLabore, s.entradaProLabore) + perna(s.saidaLucros, s.entradaLucros) + perna(s.saidaRetirada, s.entradaRetirada);
  const pagoPelaEmpresa = -s.pessoalNaPj;
  const outrasRendas = s.pfEntradas;
  const rendaTotal = rendaDoNegocio + pagoPelaEmpresa + outrasRendas;
  const custoDeVida = -s.pfDespesas - s.pfEstornos + pagoPelaEmpresa;
  const parcelasDividas = -s.pfDividas;
  const paraAEmpresa = perna(s.aporteSaidaPf, s.aporteEntradaPj) - s.pjNaPf;
  const sobra = rendaTotal - custoDeVida - parcelasDividas - paraAEmpresa;
  return {
    rendaDoNegocio,
    pagoPelaEmpresa,
    outrasRendas,
    rendaTotal,
    custoDeVida,
    parcelasDividas,
    paraAEmpresa,
    sobra,
    investido: -s.pfInvestimento,
    taxaPoupanca: div(sobra, rendaTotal),
    comprometimentoDividas: div(parcelasDividas, rendaTotal),
  };
}

export interface VisaoConsolidada {
  /** Dinheiro que entrou de fora: clientes da empresa + outras rendas pessoais. */
  entradas: number;
  impostos: number;
  despesasEmpresa: number;
  custoDeVida: number;
  parcelasDividas: number;
  /** Entradas − impostos − despesas − custo de vida − dívidas = ficou na empresa + sobrou para você. */
  resultado: number;
  ficouNaEmpresa: number;
  sobrouParaVoce: number;
}

export function visaoConsolidada(s: SomasDoMes): VisaoConsolidada {
  const pj = visaoPJ(s);
  const pf = visaoPF(s);
  // Gastos pessoais pagos pela empresa estão no custo de vida; a renda "em espécie" se anula.
  const entradas = pj.receitaTotal + pf.outrasRendas;
  const resultado = entradas - pj.impostos - pj.despesas - pf.custoDeVida - pj.parcelasDividas - pf.parcelasDividas;
  return {
    entradas,
    impostos: pj.impostos,
    despesasEmpresa: pj.despesas,
    custoDeVida: pf.custoDeVida,
    parcelasDividas: pj.parcelasDividas + pf.parcelasDividas,
    resultado,
    ficouNaEmpresa: pj.ficouNaEmpresa,
    sobrouParaVoce: pf.sobra,
  };
}

/** Média dos últimos `n` valores não nulos (ignora meses sem dados). */
export function media(valores: number[], n = 3): number {
  const ultimos = valores.slice(-n);
  return ultimos.length ? ultimos.reduce((a, b) => a + b, 0) / ultimos.length : 0;
}

/** Quantos meses um saldo cobre um gasto mensal. */
export function mesesDeCobertura(saldo: number, gastoMensal: number): number | null {
  return gastoMensal > 0 ? saldo / gastoMensal : null;
}
