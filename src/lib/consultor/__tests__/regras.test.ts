import { describe, expect, it } from "vitest";
import { SOMAS_ZERADAS, visaoPF, visaoPJ } from "../../visoes/calculo";
import { detectarAlertas, type Retrato, type TransacaoRetrato } from "../regras";

const zero = { mes: "2026-10", ...SOMAS_ZERADAS };

function retrato(parcial: Partial<Retrato> = {}): Retrato {
  return {
    hoje: "2026-11-04",
    mesFechado: "2026-10",
    pjFechado: visaoPJ(zero),
    pfFechado: visaoPF(zero),
    custoDeVidaAnteriores: [],
    custoPjMensal: 0,
    custoPfMensal: 0,
    rendaPfMedia: 0,
    saldos: { PF: 0, PJ: 0, contasSemSaldo: 0 },
    dividas: [],
    cartoes: [],
    recebiveis: { aReceber30dCentavos: 0, aReceber30dQtd: 0, vencidoCentavos: 0, vencidoQtd: 0, recebidoMesCentavos: 0, inadimplencia: 0, atrasoMedioDias: null, maiorCliente: null },
    fiscal: null,
    fluxo: { semanas: [], contasSemSaldo: 0 },
    aPagar: [],
    lembretes: [],
    transacoes: [],
    contasParadas: [],
    paraRevisar: 0,
    ...parcial,
  };
}

let id = 0;
function tx(p: Partial<TransacaoRetrato>): TransacaoRetrato {
  id++;
  return {
    id,
    contaId: 1,
    contaApelido: "Nubank · PF",
    contaTipo: "corrente",
    data: "2026-11-01",
    descricao: "X",
    descricaoNormalizada: "X",
    valorCentavos: -1000,
    escopo: "PF",
    categoriaId: null,
    categoriaNome: null,
    natureza: "comum",
    parcelaAtual: null,
    parcelaTotal: null,
    ...p,
  };
}

const chaves = (r: Retrato) => detectarAlertas(r).map((a) => a.chave.split(":")[0]);

describe("regras por transação", () => {
  it("mistura, retirada sem definição e compra parcelada nova", () => {
    const r = retrato({
      transacoes: [
        tx({ id: 101, descricao: "ZAFFARI", natureza: "despesa_pessoal_na_pj", escopo: "PF", contaApelido: "Asaas · PJ" }),
        tx({ id: 102, descricao: "PIX DIOGO", natureza: "retirada_socio", valorCentavos: -200_000, escopo: "PJ" }),
        tx({ id: 103, descricao: "NOTEBOOK 1/10", valorCentavos: -35_000, parcelaAtual: 1, parcelaTotal: 10 }),
      ],
    });
    const a = detectarAlertas(r);
    expect(a.find((x) => x.chave === "tx:mistura_pf:101")).toMatchObject({ gravidade: "atencao", transacaoId: 101 });
    expect(a.find((x) => x.chave === "tx:retirada:102")?.recomendacao).toMatch(/pró-labore/);
    expect(a.find((x) => x.chave === "tx:parcelada:103")?.mensagem).toMatch(/10× de R\$\s?350,00/);
  });

  it("transações antigas (mais de 45 dias) não geram aviso por transação", () => {
    expect(chaves(retrato({ transacoes: [tx({ data: "2026-08-01", natureza: "despesa_pessoal_na_pj" })] }))).not.toContain("tx");
  });

  it("encargos somados por conta e mês", () => {
    const r = retrato({
      transacoes: [tx({ descricao: "IOF", descricaoNormalizada: "IOF", valorCentavos: -300 }), tx({ descricao: "JUROS ROTATIVO", descricaoNormalizada: "JUROS ROTATIVO", valorCentavos: -4_500 })],
    });
    expect(detectarAlertas(r).find((a) => a.tipo === "encargos")?.mensagem).toMatch(/R\$\s?48,00/);
  });

  it("gasto muito acima do normal da categoria", () => {
    const historico = [5, 6, 7, 8].map((d) => tx({ data: `2026-10-0${d}`, categoriaId: "pf_alimentacao", categoriaNome: "Restaurantes", valorCentavos: -5_000 }));
    const fora = tx({ id: 999, data: "2026-11-02", categoriaId: "pf_alimentacao", categoriaNome: "Restaurantes", valorCentavos: -40_000 });
    const a = detectarAlertas(retrato({ transacoes: [...historico, fora] }));
    expect(a.find((x) => x.chave === "tx:atipico:999")).toBeTruthy();
  });

  it("assinatura nova e aumento de preço", () => {
    const nova = [tx({ data: "2026-10-03", descricao: "NETFLIX", descricaoNormalizada: "NETFLIX COM", valorCentavos: -5_590 }), tx({ data: "2026-11-03", descricao: "NETFLIX", descricaoNormalizada: "NETFLIX COM", valorCentavos: -5_590 })];
    const aumento = ["2026-07-10", "2026-08-10", "2026-09-10"].map((d) => tx({ data: d, descricaoNormalizada: "ACADEMIA FORTE", descricao: "ACADEMIA FORTE", valorCentavos: -9_990 }));
    aumento.push(tx({ data: "2026-10-10", descricaoNormalizada: "ACADEMIA FORTE", descricao: "ACADEMIA FORTE", valorCentavos: -12_990 }));
    const a = detectarAlertas(retrato({ transacoes: [...nova, ...aumento] }));
    expect(a.some((x) => x.chave.startsWith("recorrente_nova:PF|NETFLIX"))).toBe(true);
    expect(a.find((x) => x.chave.startsWith("recorrente_aumento:PF|ACADEMIA FORTE"))?.mensagem).toMatch(/\+30%/);
  });
});

describe("regras do fluxo", () => {
  it("dívida com tolerância atrasada é crítica; juros altos pedem avalanche", () => {
    const divida = {
      id: 1, nome: "Acordo", credor: null, tipo: "acordo_judicial", escopo: "PF" as const, parcelasTotal: 10, parcelasPagas: 2,
      totalCentavos: 100_000, pagoCentavos: 20_000, restanteCentavos: 80_000, proximaParcela: { vencimento: "2026-10-25", valorCentavos: 10_000 },
      ultimoVencimento: null, diasAtraso: 10, diasTolerancia: 30, consequenciaAtraso: "Acordo cancelado.", taxaMensal: 0.08, parcelaMensalCentavos: 10_000,
    };
    const a = detectarAlertas(retrato({ dividas: [divida] }));
    expect(a.find((x) => x.chave === "divida_risco:1")).toMatchObject({ gravidade: "critico" });
    expect(a.find((x) => x.chave === "divida_risco:1")?.mensagem).toMatch(/Faltam 20 dia/);
    expect(a.some((x) => x.chave === "divida_cara:1")).toBe(true);
  });

  it("caixa negativo previsto nas próximas semanas é crítico", () => {
    const semana = (inicio: string, pj: number, pf: number) => ({ inicio, fim: inicio, PJ: { entradas: 0, saidas: 0, saldo: pj }, PF: { entradas: 0, saidas: 0, saldo: pf } });
    const r = retrato({ saldos: { PF: 100, PJ: 100, contasSemSaldo: 0 }, fluxo: { contasSemSaldo: 0, semanas: [semana("2026-11-04", 100, 100), semana("2026-11-11", -500, 100)] } });
    expect(detectarAlertas(r).find((a) => a.chave === "fluxo_negativo:PJ:2026-11")).toMatchObject({ gravidade: "critico" });
  });

  it("reservas, retirada acima do resultado, poupança negativa e comprometimento", () => {
    const pj = visaoPJ({ ...zero, pjReceitaServicos: 1_000_000, pjDespesas: -400_000, saidaProLabore: -700_000 });
    const pf = visaoPF({ ...zero, entradaProLabore: 700_000, pfDespesas: -900_000 });
    const r = retrato({
      pjFechado: pj,
      pfFechado: pf,
      custoPjMensal: 1_100_000,
      custoPfMensal: 900_000,
      rendaPfMedia: 700_000,
      saldos: { PF: 400_000, PJ: 500_000, contasSemSaldo: 0 },
      dividas: [
        { id: 2, nome: "Empréstimo", credor: null, tipo: "emprestimo", escopo: "PF", parcelasTotal: 10, parcelasPagas: 0, totalCentavos: 3_000_000, pagoCentavos: 0, restanteCentavos: 3_000_000, proximaParcela: null, ultimoVencimento: null, diasAtraso: 0, diasTolerancia: null, consequenciaAtraso: null, taxaMensal: null, parcelaMensalCentavos: 300_000 },
      ],
    });
    const c = chaves(r);
    expect(c).toEqual(expect.arrayContaining(["socio_acima", "reserva_pj", "reserva_pf", "poupanca_negativa", "comprometimento"]));
    expect(detectarAlertas(r).find((a) => a.tipo === "dividas")?.gravidade).toBe("critico"); // 43% da renda
  });

  it("nada a dizer quando está tudo em ordem", () => {
    expect(detectarAlertas(retrato())).toEqual([]);
  });
});

describe("simulações", async () => {
  const { parcelaPrice, simularFinanciamento, simularMeta, simularProLabore, simularQuitacao } = await import("../simulacoes");
  it("Price: R$ 10.000 a 2% em 12 meses ≈ R$ 945,60", () => {
    expect(parcelaPrice(1_000_000, 0.02, 12)).toBe(94_560);
    expect(parcelaPrice(1_200_000, 0, 12)).toBe(100_000);
  });
  it("financiamento do carro com avaliação pela renda", () => {
    const r = simularFinanciamento({ valorBemCentavos: 2_500_000, entradaCentavos: 1_000_000, taxaMensal: 0.018, meses: 36, rendaMensalCentavos: 700_000, parcelasAtuaisCentavos: 100_000, ipvaAnual: 0.03 });
    expect(r.financiadoCentavos).toBe(1_500_000);
    expect(r.parcelaCentavos).toBeGreaterThan(55_000);
    expect(r.avaliacao[0]).toMatch(/Entrada de 40%/);
    expect(r.custoMensalTotalCentavos).toBe(r.parcelaCentavos + 6_250);
  });
  it("pró-labore: subir para o mínimo do Fator R muda o anexo", () => {
    const r = simularProLabore({ rbt12Centavos: 13_200_000, receitaMensalMediaCentavos: 1_100_000, proLaboreAtualCentavos: 150_000, proLaboreNovoCentavos: 308_000 });
    expect(r.atual.anexo).toBe("V");
    expect(r.novo.anexo).toBe("III");
    expect(r.proLaboreMinimoCentavos).toBe(308_000);
    expect(r.novo.dasMensalCentavos).toBeLessThan(r.atual.dasMensalCentavos);
  });
  it("avalanche: extra na dívida de maior juro encurta o prazo", () => {
    const r = simularQuitacao(
      [
        { nome: "Cartão", restanteCentavos: 300_000, parcelaCentavos: 30_000, parcelasRestantes: 10, taxaMensal: 0.06, temConsequenciaGrave: false },
        { nome: "Acordo", restanteCentavos: 3_000_000, parcelaCentavos: 63_750, parcelasRestantes: 47, taxaMensal: null, temConsequenciaGrave: true },
      ],
      20_000,
    );
    expect(r.ordem[0].nome).toBe("Cartão");
    expect(r.alvo!.mesesComExtra).toBeLessThan(10);
    expect(r.alvo!.economiaEstimadaCentavos).toBeGreaterThan(0);
    expect(r.ordem[1].observacao).toMatch(/em dia/);
  });
  it("meta: prazo e aporte necessário", () => {
    expect(simularMeta({ valorMetaCentavos: 1_200_000, aporteMensalCentavos: 100_000, rendimentoMensal: 0 }).meses).toBe(12);
    expect(simularMeta({ valorMetaCentavos: 1_200_000, prazoMeses: 12, rendimentoMensal: 0 }).aporteNecessarioCentavos).toBe(100_000);
  });
});
