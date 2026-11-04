import { describe, expect, it } from "vitest";
import { chaveDaCompra, faturaDaCompra, parcelasFuturas, proximoVencimento, somarMeses } from "../calculo";
import { parcelasCorrigidasPelaSelic, ultimoDiaUtil, vencimentosUltimoDiaUtil } from "../../compromissos/calculo";

describe("fatura da compra", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento, na seguinte", () => {
    expect(faturaDaCompra("2026-11-02", 3, 10)).toEqual({ fechamento: "2026-11-03", vencimento: "2026-11-10" });
    expect(faturaDaCompra("2026-11-03", 3, 10)).toEqual({ fechamento: "2026-12-03", vencimento: "2026-12-10" });
  });
  it("vencimento antes do dia de fechamento fica no mês seguinte", () => {
    expect(faturaDaCompra("2026-11-20", 25, 5)).toEqual({ fechamento: "2026-11-25", vencimento: "2026-12-05" });
  });
  it("fechamento no dia 31 vira o último dia do mês", () => {
    expect(faturaDaCompra("2026-02-10", 31, 8).fechamento).toBe("2026-02-28");
  });
  it("próximo vencimento", () => {
    expect(proximoVencimento("2026-11-04", 10)).toBe("2026-11-10");
    expect(proximoVencimento("2026-11-11", 10)).toBe("2026-12-10");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("parcelas futuras", () => {
  it("remove a marca de parcela para reconhecer a mesma compra", () => {
    expect(chaveDaCompra("LOJA X PARCELA 3 DE 12")).toBe("LOJA X");
    expect(chaveDaCompra("LOJA X 03/12")).toBe("LOJA X");
    expect(chaveDaCompra("ZPYRECEITAFEDERAL (PARCELA 4 DE 12)")).toBe("ZPYRECEITAFEDERAL");
  });

  it("usa a parcela mais recente e projeta as restantes nas faturas seguintes", () => {
    const base = { contaId: 1, descricao: "LOJA X", valorCentavos: -8742, parcelaTotal: 12 };
    const futuras = parcelasFuturas(
      [
        { ...base, descricaoNormalizada: "LOJA X 03/12", parcelaAtual: 3, vencimentoFatura: "2026-10-19" },
        { ...base, descricaoNormalizada: "LOJA X 04/12", parcelaAtual: 4, vencimentoFatura: "2026-11-19" },
        // compra à vista e parcela de estorno são ignoradas
        { ...base, descricaoNormalizada: "OUTRA", parcelaAtual: 1, parcelaTotal: 1, vencimentoFatura: "2026-11-19" },
      ],
      "2026-11-04",
    );
    expect(futuras).toHaveLength(8);
    expect(futuras[0]).toMatchObject({ numero: 5, vencimento: "2026-12-19", valorCentavos: 8742 });
    expect(futuras.at(-1)).toMatchObject({ numero: 12, vencimento: "2027-07-19" });
  });
});

describe("parcelamento de imposto", () => {
  it("último dia útil do mês", () => {
    expect(ultimoDiaUtil(2026, 10)).toBe("2026-10-30"); // 31/10/2026 é sábado
    expect(ultimoDiaUtil(2026, 11)).toBe("2026-11-30");
    expect(ultimoDiaUtil(2027, 1)).toBe("2027-01-29"); // 31/01/2027 é domingo
    expect(vencimentosUltimoDiaUtil("2026-09-15", 2)).toEqual(["2026-09-30", "2026-10-30"]);
  });

  it("parcela básica + Selic acumulada + 1% no mês do pagamento", () => {
    const parcelas = parcelasCorrigidasPelaSelic({
      parcelaBasicaCentavos: 9761,
      quantidade: 4,
      vencimentos: ["2026-08-20", "2026-09-30", "2026-10-30", "2026-11-30"],
      selicMensal: 0.0108,
    });
    // Confere com um parcelamento real: R$ 97,61 → 98,58 → 99,64
    expect(parcelas.map((p) => p.valorCentavos)).toEqual([9761, 9858, 9964, 10069]);
  });
});
