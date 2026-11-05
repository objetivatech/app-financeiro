import { describe, expect, it } from "vitest";
import { type FaturaParaSituacao, type PagamentoDeFatura, type ParcelaLancada, chaveDaCompra, faturaDaCompra, fechamentoEstimado, parcelasFuturas, proximoVencimento, situacaoDasFaturas, somarMeses } from "../calculo";
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

describe("situação das faturas", () => {
  const f = (id: number, vencimento: string, reais: number, extra: Partial<FaturaParaSituacao> = {}): FaturaParaSituacao => ({
    id,
    vencimento,
    fechamento: null,
    valorCentavos: Math.round(reais * 100),
    pagaEm: null,
    ...extra,
  });
  const pg = (data: string, reais: number, fonte: "cartao" | "conta" = "conta", id = Math.random()): PagamentoDeFatura => ({ data, valorCentavos: Math.round(reais * 100), fonte, transacaoId: id });
  const opcoes = { diaFechamento: 5, hoje: "2026-11-05" };

  it("só a mais recente fica em aberto; as antigas não quitadas rolaram para a seguinte", () => {
    const r = situacaoDasFaturas([f(1, "2026-03-10", 381.27), f(2, "2026-04-10", 712.55), f(3, "2026-11-10", 2067.23)], [pg("2026-04-08", 200)], opcoes);
    expect(r.map((x) => x.status)).toEqual(["rolada", "rolada", "aberta"]);
    expect(r[0].restanteCentavos).toBe(38_127);
    expect(r[1]).toMatchObject({ pagoCentavos: 20_000, restanteCentavos: 51_255 });
    expect(r[2].restanteCentavos).toBe(206_723);
  });

  it("pagamento em várias vezes entre um fechamento e o seguinte quita a fatura", () => {
    const r = situacaoDasFaturas([f(1, "2026-10-13", 1717.75), f(2, "2026-11-10", 2067.23)], [pg("2026-10-10", 1000), pg("2026-10-20", 717.75), pg("2026-10-31", 900)], opcoes);
    expect(r[0]).toMatchObject({ status: "paga", pagaEm: "2026-10-20" });
    // Os R$ 900 antes do fechamento de novembro já estão dentro da fatura de novembro (como crédito).
    expect(r[1]).toMatchObject({ status: "aberta", restanteCentavos: 206_723 });
  });

  it("fatura mais recente paga em parte mostra o que falta", () => {
    const r = situacaoDasFaturas([f(1, "2026-11-10", 2067.23)], [pg("2026-11-06", 500), pg("2026-11-09", 567.23)], { ...opcoes, hoje: "2026-11-12" });
    expect(r[0]).toMatchObject({ status: "parcial", pagoCentavos: 106_723, restanteCentavos: 100_000 });
  });

  it("o mesmo pagamento visto na fatura e no extrato não conta em dobro", () => {
    const r = situacaoDasFaturas(
      [f(1, "2026-10-13", 1717.75), f(2, "2026-11-10", 2067.23)],
      [pg("2026-10-13", 1717.75, "conta"), pg("2026-10-13", 1717.75, "cartao")],
      opcoes,
    );
    expect(r[0]).toMatchObject({ status: "paga", pagoCentavos: 171_775 });
    expect(r[0].pagamentos).toHaveLength(1);
  });

  it("fatura marcada como paga por você fica paga, e a diferença de centavos também quita", () => {
    const r = situacaoDasFaturas([f(1, "2026-10-13", 100, { pagaEm: "2026-10-12" }), f(2, "2026-11-10", 50)], [pg("2026-11-08", 49.5)], opcoes);
    expect(r.map((x) => x.status)).toEqual(["paga", "paga"]);
  });

  it("fechamento estimado pelo dia do cartão", () => {
    expect(fechamentoEstimado({ vencimento: "2026-11-10", fechamento: null }, 5)).toBe("2026-11-05");
    expect(fechamentoEstimado({ vencimento: "2026-11-05", fechamento: null }, 28)).toBe("2026-10-28");
    expect(fechamentoEstimado({ vencimento: "2026-11-10", fechamento: "2026-11-03" }, 5)).toBe("2026-11-03");
  });
});

describe("parcelas a vencer sem contar duas vezes", () => {
  const lanc = (descricao: string, reais: number, atual: number, total: number, vencimentoFatura: string): ParcelaLancada => ({
    contaId: 1,
    descricao,
    descricaoNormalizada: descricao.toUpperCase(),
    valorCentavos: -Math.round(reais * 100),
    parcelaAtual: atual,
    parcelaTotal: total,
    vencimentoFatura,
  });

  it("junta a mesma compra lida com descrição ou centavos diferentes entre faturas", () => {
    const futuras = parcelasFuturas(
      [lanc("LOJA X PARC 03/10", 100.01, 3, 10, "2026-09-10"), lanc("LOJAX 04/10", 100, 4, 10, "2026-10-10"), lanc("Loja X", 100, 5, 10, "2026-11-10")],
      "2026-11-05",
    );
    expect(futuras.map((p) => p.numero)).toEqual([6, 7, 8, 9, 10]);
  });

  it("parcelas de meses que já têm fatura não entram (já estão dentro dela)", () => {
    const futuras = parcelasFuturas([lanc("CURSO", 50, 2, 6, "2026-10-10")], "2026-11-05", new Set(["2026-11"]));
    expect(futuras.map((p) => p.vencimento)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
  });
});
