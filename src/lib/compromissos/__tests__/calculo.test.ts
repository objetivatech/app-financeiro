import { describe, expect, it } from "vitest";
import { casarPagamentos, lerParcelasDigitadas, parcelasFixas, taxaAnual, taxaMensal, vencimentosMensais } from "../calculo";

describe("parcelas", () => {
  it("gera vencimentos mensais e ajusta meses curtos", () => {
    expect(vencimentosMensais("2026-10-20", 3)).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
    expect(vencimentosMensais("2026-01-31", 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("parcelas fixas: o acordo de 53 parcelas termina em fevereiro de 2031", () => {
    const p = parcelasFixas("2026-10-20", 53, 63_750);
    expect(p).toHaveLength(53);
    expect(p.at(-1)).toEqual({ numero: 53, vencimento: "2031-02-20", valorCentavos: 63_750 });
  });

  it("lê parcelas digitadas com valores diferentes", () => {
    const { parcelas, erros } = lerParcelasDigitadas("20/12/2026 467,91\n20/11/2026; 639,88\nlixo\n20/01/2027\t467,92");
    expect(erros).toEqual(["lixo"]);
    expect(parcelas.map((p) => [p.numero, p.vencimento, p.valorCentavos])).toEqual([
      [1, "2026-11-20", 63_988],
      [2, "2026-12-20", 46_791],
      [3, "2027-01-20", 46_792],
    ]);
  });
});

describe("custo da dívida", () => {
  it("sem juros dá zero", () => {
    expect(taxaMensal(30_000, parcelasFixas("2026-12-01", 3, 10_000))).toBe(0);
  });

  it("calcula a taxa mensal efetiva", () => {
    // R$ 1.000 em 12× de R$ 100: cerca de 2,92% ao mês.
    const r = taxaMensal(100_000, parcelasFixas("2026-12-01", 12, 10_000))!;
    expect(r).toBeCloseTo(0.0292, 3);
    expect(taxaAnual(r)).toBeCloseTo(0.412, 2);
  });
});

describe("conciliação de contas a pagar", () => {
  const t = (id: number, data: string, valor: number, desc = "PAGAMENTO", contaId = 1) => ({
    id,
    data,
    valorCentavos: valor,
    contaId,
    descricaoNormalizada: desc,
  });

  it("casa valor exato perto do vencimento, uma transação por compromisso", () => {
    const pares = casarPagamentos(
      [
        { id: 1, valorCentavos: 63_750, vencimento: "2026-11-20", contaId: null, padraoExtrato: null },
        { id: 2, valorCentavos: 63_750, vencimento: "2026-12-20", contaId: null, padraoExtrato: null },
      ],
      [t(10, "2026-11-19", -63_750), t(11, "2026-11-25", -63_750), t(12, "2026-11-20", 63_750)],
    );
    expect(pares).toEqual([{ compromissoId: 1, transacaoId: 10 }]);
  });

  it("aceita valor aproximado só quando a descrição bate com o padrão", () => {
    const comp = [{ id: 1, valorCentavos: 20_000, vencimento: "2026-11-10", contaId: 1, padraoExtrato: "CEEE" }];
    expect(casarPagamentos(comp, [t(1, "2026-11-09", -20_900, "PAGTO CONTA LUZ CEEE")])).toHaveLength(1);
    expect(casarPagamentos(comp, [t(1, "2026-11-09", -20_900, "OUTRA COISA")])).toHaveLength(0);
    // Conta diferente da cadastrada não casa.
    expect(casarPagamentos(comp, [t(1, "2026-11-09", -20_000, "CEEE", 2)])).toHaveLength(0);
  });
});

describe("conciliação de parcelamento de imposto", () => {
  it("aceita até 5% de diferença quando a descrição é de guia de imposto", async () => {
    const { casarPagamentos, PADRAO_GUIA_IMPOSTO } = await import("../calculo");
    const pares = casarPagamentos(
      [{ id: 1, valorCentavos: 10069, vencimento: "2026-11-30", contaId: null, padraoExtrato: null, padraoRegex: PADRAO_GUIA_IMPOSTO }],
      [
        { id: 7, data: "2026-11-27", valorCentavos: -10071, contaId: 3, descricaoNormalizada: "PIX MERCADO" },
        { id: 8, data: "2026-11-28", valorCentavos: -10075, contaId: 3, descricaoNormalizada: "PAGAMENTO DAS SIMPLES NACIONAL" },
      ],
    );
    expect(pares).toEqual([{ compromissoId: 1, transacaoId: 8 }]);
  });
});
