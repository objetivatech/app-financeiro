import { describe, expect, it } from "vitest";
import { apurarCompetencia, vencimentoDoImposto } from "../apuracao";
import { folhaDoFatorR } from "../simples";
import { casarPagamentos } from "../../compromissos/calculo";
import { PADRAO_DAS } from "../impostos-a-pagar";
import { NOME_TIPO_TAXA, tipoDaTaxa } from "../../taxas";

const base = {
  competencia: "2026-10",
  regime: "simples" as const,
  receitaCentavos: 1_000_000,
  receitaIssRetidoCentavos: 0,
  quantidadeNotas: 3,
  rbt12Centavos: 9_000_000,
  folha12Centavos: 9_000_000 * 0.3,
  proLaboreCentavos: 250_000,
  sujeitoFatorR: true,
};

describe("impostos por competência", () => {
  it("vence dia 20 do mês seguinte, antecipando fim de semana e feriado nacional", () => {
    expect(vencimentoDoImposto("2026-09")).toBe("2026-10-20"); // terça
    expect(vencimentoDoImposto("2026-10")).toBe("2026-11-19"); // 20/11 é feriado (Consciência Negra)
    expect(vencimentoDoImposto("2026-11")).toBe("2026-12-18"); // 20/12 é domingo
    expect(vencimentoDoImposto("2027-02")).toBe("2027-03-19"); // sábado
  });

  it("Anexo III com Fator R ≥ 28%: DAS = receita × 6% na 1ª faixa; INSS 11% do pró-labore", () => {
    const a = apurarCompetencia(base);
    expect(a).toMatchObject({ anexo: "III", dasCentavos: 60_000, inssCentavos: 27_500, vencimento: "2026-11-19" });
  });

  it("Fator R abaixo de 28% vai para o Anexo V (15,5% na 1ª faixa)", () => {
    expect(apurarCompetencia({ ...base, folha12Centavos: 9_000_000 * 0.2 })).toMatchObject({ anexo: "V", dasCentavos: 155_000 });
  });

  it("ISS retido pelo cliente sai do DAS (parte do ISS na 1ª faixa do Anexo III: 33,5%)", () => {
    const a = apurarCompetencia({ ...base, receitaIssRetidoCentavos: 1_000_000 });
    expect(a.issRetidoDeduzidoCentavos).toBe(20_100);
    expect(a.dasCentavos).toBe(39_900);
  });

  it("mês de MEI: DAS fixo (sem cálculo sobre as notas) e sem INSS de pró-labore", () => {
    expect(apurarCompetencia({ ...base, regime: "mei" })).toMatchObject({ dasCentavos: null, inssCentavos: 0 });
  });

  it("baixa da guia aceita diferença maior que a das contas fixas (o DAS é estimado)", () => {
    const guia = { id: 7, data: "2026-11-19", valorCentavos: -68_000, contaId: 1, descricaoNormalizada: "PAGAMENTO DAS SIMPLES NACIONAL" };
    const c = { id: 1, valorCentavos: 60_000, vencimento: "2026-11-19", contaId: null, padraoExtrato: null, padraoRegex: PADRAO_DAS };
    expect(casarPagamentos([c], [guia])).toHaveLength(0);
    expect(casarPagamentos([{ ...c, tolerancia: 0.3 }], [guia])).toEqual([{ compromissoId: 1, transacaoId: 7 }]);
  });
});

describe("taxas do Asaas por tipo", () => {
  it.each([
    ["TAXA DE MENSAGERIA - FATURA NR 123", "notificacao"],
    ["TAXA DE NOTIFICACAO POR SMS", "notificacao"],
    ["TAXA DO PIX - FATURA NR 99", "pix"],
    ["TAXA DE BOLETO", "boleto"],
    ["TAXA DE CARTAO DE CREDITO", "cartao"],
    ["TAXA DE EMISSAO DE NOTA FISCAL", "nota"],
    ["TAXA DE TRANSFERENCIA", "transferencia"],
    ["TAXA", "outras"],
  ])("%s → %s", (descricao, tipo) => {
    expect(tipoDaTaxa(descricao)).toBe(tipo);
    expect(NOME_TIPO_TAXA[tipoDaTaxa(descricao)]).toBeTruthy();
  });
});

describe("Fator R de quem acabou de sair do MEI (guia real de set/2026)", () => {
  it("folha dos 12 meses: soma; com menos meses, média × 12; no primeiro mês, a do próprio mês × 12", () => {
    expect(folhaDoFatorR(Array(12).fill(450_000), 450_000)).toBe(5_400_000);
    expect(folhaDoFatorR([...Array(10).fill(0), 450_000, 450_000], 450_000)).toBe(5_400_000);
    expect(folhaDoFatorR(Array(12).fill(0), 450_000)).toBe(5_400_000);
    expect(folhaDoFatorR(Array(12).fill(0), 0)).toBe(0);
  });

  it("set/2026: 1º mês com pró-labore de R$ 4.500 → Anexo III, 6% → DAS de R$ 458,32 (igual à guia)", () => {
    const a = apurarCompetencia({
      ...base,
      competencia: "2026-09",
      receitaCentavos: 763_867,
      rbt12Centavos: 11_000_000,
      folha12Centavos: folhaDoFatorR(Array(12).fill(0), 450_000),
      proLaboreCentavos: 450_000,
    });
    expect(a).toMatchObject({ anexo: "III", dasCentavos: 45_832, inssCentavos: 49_500, vencimento: "2026-10-20" });
  });
});
