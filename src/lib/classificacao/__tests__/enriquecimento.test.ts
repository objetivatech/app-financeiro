import { describe, expect, it } from "vitest";
import {
  chaveDoEstabelecimento,
  classificarPorCnae,
  classificarPorEstabelecimento,
  classificarPorHistorico,
  indiceDoHistorico,
  tipoPorCnae,
} from "../enriquecimento";
import { normalizarTexto } from "../../importacao/util";

const n = normalizarTexto;

describe("dicionário de estabelecimentos", () => {
  it("usa o escopo da conta para escolher a categoria", () => {
    expect(classificarPorEstabelecimento(n("IFOOD *RESTAURANTE"), -4590, "PF")).toMatchObject({ categoriaId: "pf_alimentacao" });
    expect(classificarPorEstabelecimento(n("UBER *TRIP"), -2300, "PF")).toMatchObject({ categoriaId: "pf_transporte" });
    expect(classificarPorEstabelecimento(n("Uber Eats"), -2300, "PF")).toMatchObject({ categoriaId: "pf_alimentacao" });
  });
  it("ferramentas de trabalho são da empresa mesmo pagas na conta pessoal", () => {
    expect(classificarPorEstabelecimento(n("HOSTINGER BR"), -8990, "PF")).toEqual(expect.objectContaining({ escopo: "PJ", categoriaId: "pj_software" }));
    expect(classificarPorEstabelecimento(n("GOOGLE *ADS1234"), -50000, null)).toMatchObject({ escopo: "PJ", categoriaId: "pj_marketing" });
  });
  it("gasto de consumo em conta da empresa fica para a IA (provável gasto pessoal)", () => {
    expect(classificarPorEstabelecimento(n("ZAFFARI LOJA 12"), -25000, "PJ")).toBeNull();
  });
  it("não confunde Mercado Pago, Simples Nacional nem entradas", () => {
    expect(classificarPorEstabelecimento(n("PIX ENVIADO MERCADO PAGO"), -1000, "PF")).toBeNull();
    expect(classificarPorEstabelecimento(n("DAS SIMPLES NACIONAL"), -45832, "PJ")).toBeNull();
    expect(classificarPorEstabelecimento(n("IFOOD"), 4590, "PF")).toBeNull();
  });
});

describe("CNAE", () => {
  it("varejo separado por classe", () => {
    expect(tipoPorCnae("4711302")).toBe("mercado");
    expect(tipoPorCnae("4731800")).toBe("transporte");
    expect(tipoPorCnae("4771701")).toBe("saude");
    expect(tipoPorCnae("4781400")).toBe("compras");
  });
  it("demais pela divisão", () => {
    expect(tipoPorCnae("5611201")).toBe("alimentacao");
    expect(tipoPorCnae("6920601")).toBe("contabilidade");
    expect(tipoPorCnae("6201501")).toBe("software");
    expect(tipoPorCnae("6422100")).toBeNull(); // bancos: costuma ser transferência
  });
  it("vira categoria pelo escopo", () => {
    expect(classificarPorCnae("5611201", "Restaurantes", -3000, "PF")).toMatchObject({ categoriaId: "pf_alimentacao" });
    expect(classificarPorCnae("6920601", "Contabilidade", -30000, "PJ")).toMatchObject({ categoriaId: "pj_contabilidade" });
  });
});

describe("histórico", () => {
  it("chave do estabelecimento ignora meio de pagamento, datas e códigos", () => {
    expect(chaveDoEstabelecimento(n("PIX ENVIADO 03/11 JOAO DA SILVA 123456"))).toBe("JOAO DA SILVA");
    expect(chaveDoEstabelecimento(n("COMPRA CARTAO PADARIA BOM PAO 02/11"))).toBe("PADARIA BOM PAO");
    expect(chaveDoEstabelecimento(n("PAGBANK TARIFA"))).toBe("PAGBANK TARIFA");
  });
  it("repete a sua decisão quando ela é consistente", () => {
    const indice = indiceDoHistorico([
      { descricaoNormalizada: n("PIX ENVIADO ESCOLINHA ABC 01/09"), valorCentavos: -50000, escopo: "PF", categoriaId: "pf_educacao" },
      { descricaoNormalizada: n("PIX ENVIADO ESCOLINHA ABC 01/10"), valorCentavos: -50000, escopo: "PF", categoriaId: "pf_educacao" },
    ]);
    expect(classificarPorHistorico(n("PIX ENVIADO ESCOLINHA ABC 03/11"), -50000, indice)).toMatchObject({ escopo: "PF", categoriaId: "pf_educacao" });
    // Entrada não usa o histórico de saídas
    expect(classificarPorHistorico(n("PIX RECEBIDO ESCOLINHA ABC"), 50000, indice)).toBeNull();
  });
  it("não decide quando você classificou de jeitos diferentes", () => {
    const indice = indiceDoHistorico([
      { descricaoNormalizada: n("LOJA XPTO"), valorCentavos: -1000, escopo: "PF", categoriaId: "pf_compras" },
      { descricaoNormalizada: n("LOJA XPTO"), valorCentavos: -1000, escopo: "PJ", categoriaId: "pj_equipamentos" },
    ]);
    expect(classificarPorHistorico(n("LOJA XPTO"), -1000, indice)).toBeNull();
  });
});
