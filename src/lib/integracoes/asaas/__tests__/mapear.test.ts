import { describe, expect, it } from "vitest";
import { compromissoDaCobranca, extratoDoAsaas, statusDaCobranca, sugestaoDoLancamento } from "../mapear";

const HOJE = "2026-11-03";

describe("cobranças do Asaas", () => {
  it("mapeia status", () => {
    expect(statusDaCobranca({ id: "1", status: "RECEIVED" }, HOJE)).toBe("pago");
    expect(statusDaCobranca({ id: "1", status: "CONFIRMED" }, HOJE)).toBe("pago");
    expect(statusDaCobranca({ id: "1", status: "OVERDUE" }, HOJE)).toBe("vencido");
    expect(statusDaCobranca({ id: "1", status: "REFUNDED" }, HOJE)).toBe("cancelado");
    expect(statusDaCobranca({ id: "1", status: "PENDING", dueDate: "2026-11-10" }, HOJE)).toBe("aberto");
    // Pendente com vencimento passado (o Asaas ainda não virou para OVERDUE).
    expect(statusDaCobranca({ id: "1", status: "PENDING", dueDate: "2026-11-01" }, HOJE)).toBe("vencido");
    expect(statusDaCobranca({ id: "1", status: "RECEIVED", deleted: true }, HOJE)).toBe("cancelado");
  });

  it("vira um compromisso a receber da PJ", () => {
    const c = compromissoDaCobranca(
      {
        id: "pay_1",
        value: 1500,
        netValue: 1498.01,
        status: "RECEIVED",
        billingType: "PIX",
        dueDate: "2026-10-20",
        paymentDate: "2026-10-21",
        clientPaymentDate: "2026-10-19",
        description: "Consultoria SEO outubro",
        invoiceUrl: "https://www.asaas.com/i/abc",
      },
      HOJE,
    );
    expect(c).toMatchObject({
      tipo: "receber",
      escopo: "PJ",
      valorCentavos: 150_000,
      valorLiquidoCentavos: 149_801,
      status: "pago",
      dataPagamento: "2026-10-19",
      formaPagamento: "pix",
      idExterno: "pay_1",
      categoriaId: "pj_receita",
    });
  });
});

describe("extrato do Asaas", () => {
  it("sugere categoria pelo tipo do lançamento", () => {
    expect(sugestaoDoLancamento("PAYMENT_RECEIVED")?.categoriaId).toBe("pj_receita");
    expect(sugestaoDoLancamento("PAYMENT_FEE")?.categoriaId).toBe("pj_taxas_pagamento");
    expect(sugestaoDoLancamento("PIX_TRANSACTION_DEBIT_FEE")?.categoriaId).toBe("pj_taxas_pagamento");
    expect(sugestaoDoLancamento("ASAAS_CARD_BILL_PAYMENT")?.natureza).toBe("pagamento_fatura");
    // Transferências ficam para o motor de pareamento / IA.
    expect(sugestaoDoLancamento("TRANSFER")).toBeUndefined();
    expect(sugestaoDoLancamento("PIX_TRANSACTION_DEBIT")).toBeUndefined();
  });

  it("converte valores com sinal e confere a sequência de saldos", () => {
    const e = extratoDoAsaas(
      [
        { id: "a", date: "2026-10-01", value: 1500, balance: 1500, type: "PAYMENT_RECEIVED", description: "Cobrança recebida - Cliente A" },
        { id: "b", date: "2026-10-01", value: -1.99, balance: 1498.01, type: "PAYMENT_FEE", description: "Taxa de cobrança" },
        { id: "c", date: "2026-10-02", value: -500, balance: 900, type: "TRANSFER", description: "Transferência para conta" },
      ],
      { inicio: "2026-10-01", fim: "2026-10-02" },
    );
    expect(e.transacoes.map((t) => t.valorCentavos)).toEqual([150_000, -199, -50_000]);
    expect(e.saldoFinalCentavos).toBe(90_000);
    // 1498,01 − 500 = 998,01 ≠ 900: avisa.
    expect(e.avisos).toHaveLength(1);
    expect(e.transacoes[2].sugestao).toBeUndefined();
  });
});
