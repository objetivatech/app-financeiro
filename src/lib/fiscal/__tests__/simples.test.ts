import { describe, expect, it } from "vitest";
import { aliquotaEfetiva, diagnosticarFatorR, fatorR } from "../simples";

describe("Simples Nacional", () => {
  it("primeira faixa: alíquota efetiva igual à nominal", () => {
    expect(aliquotaEfetiva("III", 13_200_000)).toBeCloseTo(0.06, 6);
    expect(aliquotaEfetiva("V", 13_200_000)).toBeCloseTo(0.155, 6);
  });

  it("segunda faixa aplica a parcela a deduzir", () => {
    // RBT12 R$ 240.000 no Anexo III: (240000 × 11,2% − 9360) / 240000 = 7,3%
    expect(aliquotaEfetiva("III", 24_000_000)).toBeCloseTo(0.073, 6);
  });

  it("Fator R ≥ 28% leva ao Anexo III", () => {
    // Pró-labore R$ 4.500 × 12 = R$ 54.000; RBT12 = R$ 132.000 → 40,9%
    const d = diagnosticarFatorR({
      rbt12Centavos: 13_200_000,
      folha12Centavos: 5_400_000,
      receitaDoMesCentavos: 763_867,
      proLaboreMensalCentavos: 450_000,
    });
    expect(d.fatorR).toBeCloseTo(0.409, 3);
    expect(d.anexo).toBe("III");
    // Confere com um DAS real de primeira faixa: 6% de R$ 7.638,67 ≈ R$ 458,32
    expect(d.dasEstimadoCentavos).toBe(45_832);
    expect(d.dasNoOutroAnexoCentavos).toBe(Math.round(763_867 * 0.155));
    // Pró-labore mínimo: 28% × 132.000 / 12 = R$ 3.080
    expect(d.proLaboreMinimoCentavos).toBe(308_000);
    // Receita média máxima com pró-labore de R$ 4.500: 4.500 / 0,28 ≈ R$ 16.071,42
    expect(d.receitaMensalMaximaCentavos).toBe(1_607_142);
  });

  it("Fator R abaixo de 28% cai no Anexo V", () => {
    expect(fatorR(3_000_000, 20_000_000)).toBeCloseTo(0.15, 6);
    const d = diagnosticarFatorR({ rbt12Centavos: 20_000_000, folha12Centavos: 3_000_000, receitaDoMesCentavos: 1_000_000, proLaboreMensalCentavos: 250_000 });
    expect(d.anexo).toBe("V");
  });
});

describe("datas em Brasília", () => {
  it("às 22h de Brasília (01h UTC do dia seguinte) ainda é o mesmo dia", async () => {
    const { hojeBrasil, primeiroDoMes, somarDias } = await import("../../datas");
    expect(hojeBrasil(new Date("2026-11-03T01:30:00Z"))).toBe("2026-11-02");
    expect(primeiroDoMes(-13, "2026-11-02")).toBe("2025-10-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("enquadramento MEI → ME", async () => {
  const { EsquemaPerfilFiscal, meiAte, regimeNoMes } = await import("../perfil");
  const { inicioDaFolha } = await import("../indicadores");
  const perfil = EsquemaPerfilFiscal.parse({
    regimes: [
      { regime: "mei", inicio: "2000-01" },
      { regime: "simples", inicio: "2026-09" },
    ],
  });
  it("lê até quando foi MEI e o regime de cada mês", () => {
    expect(meiAte(perfil)).toBe("2026-08");
    expect(regimeNoMes(perfil, "2026-08")).toBe("mei");
    expect(regimeNoMes(perfil, "2026-11")).toBe("simples");
    expect(regimeNoMes(EsquemaPerfilFiscal.parse({}), "2026-11")).toBe("simples");
  });
  it("a folha começa com a ME, a menos que o pró-labore tenha data própria", () => {
    expect(inicioDaFolha(perfil)).toBe("2026-09");
    expect(inicioDaFolha({ ...perfil, proLaboreDesde: "2026-10" })).toBe("2026-10");
    expect(inicioDaFolha(EsquemaPerfilFiscal.parse({}))).toBeNull();
  });
});
