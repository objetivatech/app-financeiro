import { describe, expect, it } from "vitest";
import {
  aplicar,
  aplicarEscopoDaConta,
  aplicarHeuristicas,
  aplicarRegras,
  marcarMistura,
  parearTransferencias,
  type ContaContexto,
  type TransacaoClassificavel,
} from "../motor";

let proximoId = 1;
function tx(parcial: Partial<TransacaoClassificavel> & Pick<TransacaoClassificavel, "contaId" | "valorCentavos" | "descricaoNormalizada">): TransacaoClassificavel {
  return {
    id: proximoId++,
    data: "2026-02-25",
    documentoContraparte: null,
    escopo: null,
    categoriaId: null,
    natureza: "comum",
    classificadoPor: null,
    parTransferenciaId: null,
    revisar: false,
    motivo: null,
    confianca: null,
    ...parcial,
  };
}

const contaPJ: ContaContexto = { id: 1, tipo: "corrente", escopoPadrao: "PJ" };
const contaPF: ContaContexto = { id: 2, tipo: "corrente", escopoPadrao: "PF" };
const cartaoPF: ContaContexto = { id: 3, tipo: "cartao_credito", escopoPadrao: "PF" };
const contaMista: ContaContexto = { id: 4, tipo: "pagamento", escopoPadrao: "misto" };
const contas = new Map([contaPJ, contaPF, cartaoPF, contaMista].map((c) => [c.id, c]));

describe("heurísticas", () => {
  it("reconhece DAS do Simples como imposto da PJ", () => {
    const t = tx({ contaId: 2, valorCentavos: -61237, descricaoNormalizada: "PAGAMENTO DAS SIMPLES NACIONAL" });
    aplicarHeuristicas(t, contaPF);
    expect(t).toMatchObject({ natureza: "imposto", categoriaId: "pj_impostos", escopo: "PJ" });
  });

  it("não confunde a preposição 'das' com a guia DAS", () => {
    const t = tx({ contaId: 2, valorCentavos: -5000, descricaoNormalizada: "COMPRA LOJA DAS FLORES" });
    expect(aplicarHeuristicas(t, contaPF)).toBe(false);
  });

  it("'pagamento recebido' só é pagamento de fatura no cartão", () => {
    const noCartao = tx({ contaId: 3, valorCentavos: 50000, descricaoNormalizada: "PAGAMENTO RECEBIDO" });
    aplicarHeuristicas(noCartao, cartaoPF);
    expect(noCartao.natureza).toBe("pagamento_fatura");
    const naConta = tx({ contaId: 4, valorCentavos: 50000, descricaoNormalizada: "PAGAMENTO RECEBIDO" });
    expect(aplicarHeuristicas(naConta, contaMista)).toBe(false);
  });
});

describe("prioridade", () => {
  it("a IA não sobrescreve a decisão do usuário, mas sobrescreve o palpite da conta", () => {
    const t = tx({ contaId: 1, valorCentavos: -1000, descricaoNormalizada: "X" });
    aplicarEscopoDaConta(t, contaPJ);
    expect(t.escopo).toBe("PJ");
    aplicar(t, "ia", { escopo: "PF", categoriaId: "pf_lazer" });
    expect(t.escopo).toBe("PF");
    aplicar(t, "usuario", { escopo: "PJ" });
    expect(aplicar(t, "ia", { escopo: "PF" })).toBe(false);
    expect(t.escopo).toBe("PJ");
  });

  it("regra da conta vence regra global e padrão mais longo vence o curto", () => {
    const t = tx({ contaId: 1, valorCentavos: -1000, descricaoNormalizada: "PIX ENVIADO JOAO CONTADOR" });
    aplicarRegras(t, [
      { padrao: "PIX ENVIADO", contaId: null, escopo: "PF", categoriaId: "pf_outros", natureza: null },
      { padrao: "JOAO CONTADOR", contaId: 1, escopo: "PJ", categoriaId: "pj_contabilidade", natureza: null },
    ]);
    expect(t).toMatchObject({ escopo: "PJ", categoriaId: "pj_contabilidade", classificadoPor: "regra" });
  });
});

describe("parearTransferencias", () => {
  it("PJ → PF vira retirada do sócio para revisar (pró-labore ou lucros?)", () => {
    const saida = tx({ contaId: 1, valorCentavos: -500000, descricaoNormalizada: "PIX ENVIADO - TRANSFERENCIA PARA CONTA PESSOAL" });
    const entrada = tx({ contaId: 2, valorCentavos: 500000, data: "2026-02-26", descricaoNormalizada: "TRANSFERENCIA RECEBIDA PELO PIX - MINHA EMPRESA LTDA" });
    const outra = tx({ contaId: 2, valorCentavos: 500000, data: "2026-03-20", descricaoNormalizada: "PIX RECEBIDO" });
    expect(parearTransferencias([saida, entrada, outra], contas, new Set())).toBe(1);
    expect(saida.parTransferenciaId).toBe(entrada.id);
    expect(saida).toMatchObject({ natureza: "retirada_socio", escopo: "PJ", revisar: true });
    expect(entrada).toMatchObject({ natureza: "retirada_socio", escopo: "PF" });
    expect(outra.parTransferenciaId).toBeNull();
  });

  it("mantém pró-labore quando a descrição já dizia", () => {
    const saida = tx({ contaId: 1, valorCentavos: -300000, descricaoNormalizada: "PIX PRO LABORE" });
    aplicarHeuristicas(saida, contaPJ);
    const entrada = tx({ contaId: 2, valorCentavos: 300000, descricaoNormalizada: "PIX RECEBIDO" });
    parearTransferencias([saida, entrada], contas, new Set());
    expect(saida).toMatchObject({ natureza: "pro_labore", revisar: false });
  });

  it("conta → cartão vira pagamento de fatura", () => {
    const saida = tx({ contaId: 2, valorCentavos: -50000, descricaoNormalizada: "PAGAMENTO DE FATURA" });
    const entrada = tx({ contaId: 3, valorCentavos: 50000, descricaoNormalizada: "PAGAMENTO RECEBIDO" });
    parearTransferencias([saida, entrada], contas, new Set());
    expect(entrada.natureza).toBe("pagamento_fatura");
  });

  it("não pareia valores iguais sem nenhum indício de transferência", () => {
    const a = tx({ contaId: 1, valorCentavos: -9990, descricaoNormalizada: "COMPRA LOJA X" });
    const b = tx({ contaId: 2, valorCentavos: 9990, descricaoNormalizada: "ESTORNO LOJA Y" });
    expect(parearTransferencias([a, b], contas, new Set())).toBe(0);
  });

  it("usa o CPF/CNPJ do usuário como indício", () => {
    const a = tx({ contaId: 1, valorCentavos: -1000, descricaoNormalizada: "OPERACAO 123", documentoContraparte: "52998224725" });
    const b = tx({ contaId: 2, valorCentavos: 1000, descricaoNormalizada: "CREDITO 456" });
    expect(parearTransferencias([a, b], contas, new Set(["52998224725"]))).toBe(1);
  });
});

describe("marcarMistura", () => {
  it("gasto pessoal na conta da empresa é sinalizado", () => {
    const t = tx({ contaId: 1, valorCentavos: -15000, descricaoNormalizada: "IFOOD", escopo: "PF" });
    marcarMistura(t, contaPJ);
    expect(t).toMatchObject({ natureza: "despesa_pessoal_na_pj", revisar: true });
  });

  it("gasto da empresa no cartão pessoal também", () => {
    const t = tx({ contaId: 3, valorCentavos: -9900, descricaoNormalizada: "GOOGLE WORKSPACE", escopo: "PJ" });
    marcarMistura(t, cartaoPF);
    expect(t.natureza).toBe("despesa_pj_na_pf");
  });
});

describe("identidade: retiradas e aportes com um lado só", async () => {
  const { aplicarIdentidade, variantesDeNome } = await import("../motor");
  const id = {
    docsSocio: new Set(["12345678909"]),
    nomesSocio: variantesDeNome("DIOGO DA SILVA DEVITTE"),
    docsEmpresa: new Set(["28250988000166"]),
    nomesEmpresa: ["DIOGO DEVITTE CONSULTORIA E SERVICOS EM MARKETING LTDA", "RANKTOP"],
  };
  const base = { id: 1, contaId: 1, data: "2026-10-05", documentoContraparte: null, escopo: null, categoriaId: null, natureza: "comum" as const, classificadoPor: null, parTransferenciaId: null, revisar: false, motivo: null, confianca: null };
  const pj = { id: 1, tipo: "pagamento" as const, escopoPadrao: "PJ" as const };
  const pf = { id: 2, tipo: "corrente" as const, escopoPadrao: "PF" as const };

  it("variantes do nome", () => {
    expect(variantesDeNome("DIOGO DA SILVA DEVITTE")).toEqual(expect.arrayContaining(["DIOGO DA SILVA DEVITTE", "DIOGO DEVITTE"]));
  });
  it("Pix da empresa para o seu nome vira retirada a definir", () => {
    const t = { ...base, descricaoNormalizada: "PIX ENVIADO DIOGO DEVITTE", valorCentavos: -200_000, classificadoPor: "ia" as const, categoriaId: "pj_folha" };
    expect(aplicarIdentidade(t, pj, id)).toBe(true);
    expect(t).toMatchObject({ natureza: "retirada_socio", categoriaId: "mov_socio", escopo: "PJ", revisar: true });
  });
  it("pelo CPF na contraparte, mesmo sem nome", () => {
    const t = { ...base, descricaoNormalizada: "PIX ENVIADO", documentoContraparte: "12345678909", valorCentavos: -100_000 };
    expect(aplicarIdentidade(t, pj, id)).toBe(true);
  });
  it("na conta pessoal, entrada vinda da empresa é retirada e saída para a empresa é aporte", () => {
    const entrada = { ...base, contaId: 2, descricaoNormalizada: "PIX RECEBIDO RANKTOP", valorCentavos: 450_000 };
    expect(aplicarIdentidade(entrada, pf, id)).toBe(true);
    expect(entrada).toMatchObject({ natureza: "retirada_socio", escopo: "PF" });
    const saida = { ...base, contaId: 2, descricaoNormalizada: "PIX ENVIADO DIOGO DEVITTE CONSULTORIA E SERVICOS EM MARKETING LTDA", valorCentavos: -50_000 };
    expect(aplicarIdentidade(saida, pf, id)).toBe(true);
    expect(saida).toMatchObject({ natureza: "aporte_socio" });
  });
  it("pró-labore já reconhecido continua pró-labore; correção sua não é tocada", () => {
    const pl = { ...base, descricaoNormalizada: "PIX PRO LABORE DIOGO DEVITTE", valorCentavos: -450_000, natureza: "pro_labore" as const, classificadoPor: "heuristica" as const };
    aplicarIdentidade(pl, pj, id);
    expect(pl).toMatchObject({ natureza: "pro_labore", revisar: false });
    const sua = { ...base, descricaoNormalizada: "PIX ENVIADO DIOGO DEVITTE", valorCentavos: -1_000, classificadoPor: "usuario" as const, categoriaId: "pj_outros" };
    expect(aplicarIdentidade(sua, pj, id)).toBe(false);
  });
  it("não confunde com outra pessoa", () => {
    const t = { ...base, descricaoNormalizada: "PIX ENVIADO DIOGO SOUZA", valorCentavos: -1_000 };
    expect(aplicarIdentidade(t, pj, id)).toBe(false);
  });
});
