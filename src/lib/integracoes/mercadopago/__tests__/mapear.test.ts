import { describe, expect, it } from "vitest";
import { compromissoDoPagamento, lerRelatorioLiberacoes, pareceRelatorioMercadoPago, statusDoPagamento } from "../mapear";

export const CSV_RELATORIO = [
  "DATE;SOURCE_ID;EXTERNAL_REFERENCE;RECORD_TYPE;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;GROSS_AMOUNT;MP_FEE_AMOUNT;PAYMENT_METHOD;BALANCE_AMOUNT",
  "2026-10-01T00:00:00.000-03:00;;;initial_available_balance;;100.00;0.00;;;;100.00",
  "2026-10-05T10:22:31.000-03:00;1234567890;PED-1;release;payment;485.50;0.00;500.00;14.50;pix;585.50",
  "2026-10-06T08:00:00.000-03:00;1234567891;;release;fee-release_in_advance;0.00;3.20;;;;582.30",
  "2026-10-07T09:00:00.000-03:00;99887766;;release;withdrawal;0.00;500.00;;;;82.30",
  "2026-10-08T09:00:00.000-03:00;1234567890;PED-1;release;refund;0.00;100.00;;;;-17.70",
  "2026-10-09T09:00:00.000-03:00;555;;block;dispute;0.00;50.00;;;;",
  ";;;total;;485.50;603.20;;;;",
].join("\n");

describe("Mercado Pago: pagamentos", () => {
  it("status e compromisso a receber", () => {
    expect(statusDoPagamento({ status: "approved" }, "2026-11-04")).toBe("pago");
    expect(statusDoPagamento({ status: "pending", date_of_expiration: "2026-11-01T23:59:59.000-04:00" }, "2026-11-04")).toBe("vencido");
    expect(statusDoPagamento({ status: "rejected" }, "2026-11-04")).toBeNull();
    const c = compromissoDoPagamento(
      { id: 77, status: "approved", transaction_amount: 500, transaction_details: { net_received_amount: 485.5 }, date_created: "2026-10-05T10:00:00.000-03:00", date_approved: "2026-10-05T10:22:31.000-03:00", money_release_date: "2026-10-05T10:22:31.000-03:00", payment_type_id: "bank_transfer", description: "Consultoria SEO" },
      "2026-11-04",
      "PJ",
    );
    expect(c).toMatchObject({ tipo: "receber", escopo: "PJ", status: "pago", valorCentavos: 50_000, valorLiquidoCentavos: 48_550, dataPagamento: "2026-10-05", idExterno: "77", origem: "mercadopago" });
  });
});

describe("Mercado Pago: Relatório de Liberações", () => {
  it("reconhece o arquivo e lê só as liberações", () => {
    expect(pareceRelatorioMercadoPago(CSV_RELATORIO)).toBe(true);
    const e = lerRelatorioLiberacoes(CSV_RELATORIO, { escopo: "PJ" });
    expect(e.transacoes.map((t) => t.valorCentavos)).toEqual([48_550, -320, -50_000, -10_000]);
    expect(e.transacoes[0]).toMatchObject({ data: "2026-10-05", descricao: "Recebimento no Mercado Pago · ref PED-1 · (pix)", sugestao: { categoriaId: "pj_receita" } });
    expect(e.transacoes[1].sugestao).toMatchObject({ categoriaId: "pj_taxas_pagamento" });
    expect(e.transacoes[2].descricao).toBe("Saque para conta bancária");
    expect(e.transacoes[3].sugestao).toMatchObject({ natureza: "estorno" });
    expect(e.saldoFinalCentavos).toBe(-1_770);
    expect(e.periodo).toEqual({ inicio: "2026-10-05", fim: "2026-10-08" });
  });
  it("com vírgula como separador e sem escopo conhecido, não sugere categoria", () => {
    const e = lerRelatorioLiberacoes("DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT\n2026-10-05,1,release,payment,10.00,0.00");
    expect(e.transacoes).toHaveLength(1);
    expect(e.transacoes[0].sugestao).toBeUndefined();
  });
  it("não confunde com outros CSVs", () => {
    expect(pareceRelatorioMercadoPago("Data,Valor,Identificador,Descrição\n01/10/2026,10,abc,Pix")).toBe(false);
  });
});
