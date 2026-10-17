import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { instituicaoPorCodigo, instituicaoPorTexto } from "../../instituicoes/catalogo";
import { decodificarTexto } from "../decodificar";
import { detectarFormato } from "../detectar";
import { lerArquivo } from "../importar";
import { parseCsv } from "../parsers/csv";
import { parseOfx } from "../parsers/ofx";
import { calcularHashesDedup } from "../persistir";
import type { ExtratoNormalizado } from "../tipos";
import { cnpjValido, cpfValido, encontrarDocumento, parseData, parseValorCentavos } from "../util";

const fixture = (nome: string) => new Uint8Array(readFileSync(`tests/fixtures/${nome}`));

describe("parseValorCentavos", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1.234,56", -123456],
    ["R$ 1.234,56", 123456],
    ["-R$ 10,00", -1000],
    ["(1.234,56)", -123456],
    ["1.234,56 D", -123456],
    ["1.234,56 C", 123456],
    ["1.234,56-", -123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["1.234.567", 123456700],
    ["0,99", 99],
    ["-612.37", -61237],
  ])("%s → %d", (entrada, esperado) => {
    expect(parseValorCentavos(entrada)).toBe(esperado);
  });

  it("rejeita texto que não é valor", () => {
    expect(parseValorCentavos("abc")).toBeNull();
    expect(parseValorCentavos("")).toBeNull();
  });
});

describe("parseData", () => {
  it.each([
    ["15/01/2026", "2026-01-15"],
    ["15/01/26", "2026-01-15"],
    ["2026-01-15", "2026-01-15"],
    ["20260115120000[-3:BRT]", "2026-01-15"],
    ["5/1/2026", "2026-01-05"],
  ])("%s → %s", (entrada, esperado) => {
    expect(parseData(entrada)).toBe(esperado);
  });

  it("rejeita datas impossíveis", () => {
    expect(parseData("31/02/2026")).toBeNull();
    expect(parseData("SALDO")).toBeNull();
  });
});

describe("documentos", () => {
  it("valida CPF e CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });

  it("encontra o documento num texto", () => {
    expect(encontrarDocumento("Titular: FULANO CPF 529.982.247-25")).toEqual({ tipo: "CPF", numero: "52998224725" });
  });
});

describe("catálogo de instituições", () => {
  it("reconhece pelo código COMPE", () => {
    expect(instituicaoPorCodigo("208")?.id).toBe("btg");
    expect(instituicaoPorCodigo("0260")?.id).toBe("nubank");
  });

  it("reconhece pelo texto, preferindo o alias mais específico", () => {
    expect(instituicaoPorTexto("extrato_mercado_pago_2026.csv")?.id).toBe("mercadopago");
    expect(instituicaoPorTexto("Fatura Cartão Atacadão")?.id).toBe("atacadao");
    expect(instituicaoPorTexto("CAIXA ECONOMICA FEDERAL")?.id).toBe("caixa");
    expect(instituicaoPorTexto("Banco Desconhecido SA")).toBeUndefined();
  });
});

describe("detectarFormato", () => {
  it("detecta pelos bytes, não só pela extensão", () => {
    expect(detectarFormato(new TextEncoder().encode("%PDF-1.7 ..."), "extrato.txt").formato).toBe("pdf");
    expect(detectarFormato(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "foto").mimeType).toBe("image/jpeg");
    expect(detectarFormato(fixture("extrato-btg.ofx"), "x.dat").formato).toBe("ofx");
    expect(detectarFormato(fixture("nubank-conta.csv"), "nubank-conta.csv").formato).toBe("csv");
  });

  it("explica formatos ainda não suportados", () => {
    const xlsx = detectarFormato(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "extrato.xlsx");
    expect(xlsx.naoSuportado).toMatch(/CSV/);
  });
});

describe("parseOfx", () => {
  const extrato = parseOfx(decodificarTexto(fixture("extrato-btg.ofx")));

  it("identifica banco e conta", () => {
    expect(extrato.instituicaoId).toBe("btg");
    expect(extrato.conta).toMatchObject({ tipo: "corrente", agencia: "0050", numero: "1234567" });
    expect(extrato.periodo).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(extrato.saldoFinalCentavos).toBe(288763);
  });

  it("lê as transações com sinal e FITID", () => {
    expect(extrato.transacoes).toHaveLength(3);
    expect(extrato.transacoes[0]).toMatchObject({ data: "2026-02-05", valorCentavos: 850000, idExterno: "A1" });
    expect(extrato.transacoes[2].descricao).toBe("PIX ENVIADO - TRANSFERENCIA PARA CONTA PESSOAL");
  });
});

describe("parseCsv", () => {
  it("reconhece o extrato da conta Nubank", () => {
    const { extrato } = parseCsv(decodificarTexto(fixture("nubank-conta.csv")), "NU_2026.csv");
    expect(extrato?.instituicaoId).toBe("nubank");
    expect(extrato?.conta.tipo).toBe("corrente");
    expect(extrato?.transacoes.map((t) => t.valorCentavos)).toEqual([500000, -8990, -3990]);
    expect(extrato?.transacoes[1].descricao).toContain("SUPERMERCADO");
  });

  it("inverte o sinal da fatura Nubank (compras vêm positivas)", () => {
    const { extrato } = parseCsv(decodificarTexto(fixture("nubank-cartao.csv")), "fatura.csv");
    expect(extrato?.conta.tipo).toBe("cartao_credito");
    expect(extrato?.transacoes.map((t) => t.valorCentavos)).toEqual([-2350, -19990, 50000]);
  });

  it("lê CSV em Windows-1252 com preâmbulo, ponto-e-vírgula e colunas de crédito/débito", () => {
    const { extrato } = parseCsv(decodificarTexto(fixture("bs2-latin1.csv")), "extrato.csv");
    expect(extrato?.instituicaoId).toBe("bs2");
    expect(extrato?.conta.documentoTitular).toBe("11222333000181");
    // A linha de SALDO ANTERIOR é ignorada.
    expect(extrato?.transacoes).toEqual([
      expect.objectContaining({ data: "2026-02-03", descricao: "TARIFA PACOTE SERVIÇOS", valorCentavos: -2990 }),
      expect.objectContaining({ data: "2026-02-04", valorCentavos: 125000 }),
    ]);
  });

  it("devolve vazio quando não reconhece as colunas", () => {
    const { extrato, linhas } = parseCsv("foo;bar\n1;2\n3;4\n");
    expect(extrato).toBeUndefined();
    expect(linhas).toHaveLength(3);
  });
});

describe("lerArquivo", () => {
  const extratoFalso: ExtratoNormalizado = {
    formato: "pdf",
    conta: {},
    moeda: "BRL",
    transacoes: [{ data: "2026-02-01", descricao: "X", valorCentavos: -100 }],
    avisos: [],
    extraidoPor: "ia",
  };

  it("usa o parser para OFX e não chama a IA", async () => {
    const ia = vi.fn();
    const extrato = await lerArquivo(fixture("extrato-btg.ofx"), "btg.ofx", { extratorIa: ia });
    expect(extrato.extraidoPor).toBe("parser");
    expect(ia).not.toHaveBeenCalled();
  });

  it("manda PDF e CSV desconhecido para a IA", async () => {
    const ia = vi.fn().mockResolvedValue(extratoFalso);
    await lerArquivo(new TextEncoder().encode("%PDF-1.4 conteudo"), "fatura.pdf", { extratorIa: ia });
    expect(ia).toHaveBeenLastCalledWith(expect.objectContaining({ formato: "pdf", mimeType: "application/pdf" }));
    await lerArquivo(new TextEncoder().encode("col1;col2\nfoo;bar\n"), "estranho.csv", { extratorIa: ia });
    expect(ia).toHaveBeenLastCalledWith(expect.objectContaining({ formato: "csv", texto: "col1;col2\nfoo;bar\n" }));
  });
});

describe("calcularHashesDedup", () => {
  it("distingue transações iguais no mesmo dia e ignora a descrição", () => {
    const base = { formato: "csv" as const, conta: {}, moeda: "BRL", avisos: [], extraidoPor: "parser" as const };
    const a = calcularHashesDedup({
      ...base,
      transacoes: [
        { data: "2026-02-01", descricao: "CAFE", valorCentavos: -500 },
        { data: "2026-02-01", descricao: "CAFE", valorCentavos: -500 },
      ],
    });
    expect(new Set(a).size).toBe(2);
    const b = calcularHashesDedup({
      ...base,
      transacoes: [{ data: "2026-02-01", descricao: "Café da padaria", valorCentavos: -500 }],
    });
    expect(b[0]).toBe(a[0]);
  });
});
