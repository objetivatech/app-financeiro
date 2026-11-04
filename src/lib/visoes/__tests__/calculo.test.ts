import { describe, expect, it } from "vitest";
import { SOMAS_ZERADAS, visaoConsolidada, visaoPF, visaoPJ, type SomasDoMes } from "../calculo";

const mes = (parcial: Partial<SomasDoMes>): SomasDoMes => ({ mes: "2026-10", ...SOMAS_ZERADAS, ...parcial });

describe("visões PF, PJ e consolidada", () => {
  const s = mes({
    pjReceitaServicos: 1_100_000,
    pjImpostos: -66_000,
    pjDespesas: -150_000, // inclui 20.000 de gasto da PJ pago pela PF
    pjNaPf: -20_000,
    pjDividas: -10_000,
    pjEstornos: 5_000,
    // Pró-labore: as duas pernas importadas (mesmo valor)
    saidaProLabore: -450_000,
    entradaProLabore: 450_000,
    // Retirada: só a perna da PF foi importada
    entradaRetirada: 200_000,
    pessoalNaPj: -30_000,
    pfEntradas: 10_000,
    pfDespesas: -500_000,
    pfEstornos: 8_000,
    pfDividas: -100_000,
    pfInvestimento: -50_000,
  });

  it("PJ: resultado antes do sócio, o que foi para o sócio e o que ficou", () => {
    const pj = visaoPJ(s);
    expect(pj.receitaTotal).toBe(1_100_000);
    expect(pj.despesas).toBe(145_000); // estorno abate
    expect(pj.resultadoOperacional).toBe(1_100_000 - 66_000 - 145_000 - 10_000);
    expect(pj.proLabore).toBe(450_000); // não conta duas vezes
    expect(pj.retiradas).toBe(200_000); // vale a perna que existe
    expect(pj.paraOSocio).toBe(450_000 + 200_000 + 30_000);
    expect(pj.aportes).toBe(20_000); // gasto da PJ pago pela PF
    expect(pj.ficouNaEmpresa).toBe(pj.resultadoOperacional - pj.paraOSocio + 20_000);
    expect(pj.pesoImpostos).toBeCloseTo(0.06);
  });

  it("PF: pró-labore e retiradas são renda; gasto pago pela empresa entra na renda e no custo de vida", () => {
    const pf = visaoPF(s);
    expect(pf.rendaDoNegocio).toBe(650_000);
    expect(pf.rendaTotal).toBe(650_000 + 30_000 + 10_000);
    expect(pf.custoDeVida).toBe(500_000 - 8_000 + 30_000);
    expect(pf.sobra).toBe(pf.rendaTotal - pf.custoDeVida - 100_000 - 20_000);
    expect(pf.investido).toBe(50_000);
    expect(pf.taxaPoupanca).toBeCloseTo(pf.sobra / pf.rendaTotal);
  });

  it("consolidado: o que ficou na empresa + o que sobrou para você = resultado (transferências se anulam)", () => {
    const c = visaoConsolidada(s);
    expect(c.ficouNaEmpresa + c.sobrouParaVoce).toBe(c.resultado);
    expect(c.entradas).toBe(1_110_000);
  });

  it("mês vazio não divide por zero", () => {
    const vazio = mes({});
    expect(visaoPJ(vazio).margem).toBeNull();
    expect(visaoPF(vazio).taxaPoupanca).toBeNull();
    expect(visaoConsolidada(vazio).resultado).toBe(0);
  });
});
