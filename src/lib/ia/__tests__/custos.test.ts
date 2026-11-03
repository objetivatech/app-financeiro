import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { custoEstimadoUsd, modeloDa, opcoesDeFallback } from "../cliente";
import { textoDoPdf } from "../extrator";

describe("modelos e custos", () => {
  afterEach(() => {
    delete process.env.MODELO_EXTRACAO;
  });

  it("usa Haiku para volume e Opus para a análise, com troca por variável de ambiente", () => {
    expect(modeloDa("extracao")).toBe("claude-haiku-5-5");
    expect(modeloDa("classificacao")).toBe("claude-haiku-5-5");
    expect(modeloDa("analise")).toBe("claude-opus-5-5");
    process.env.MODELO_EXTRACAO = "claude-sonnet-5-5";
    expect(modeloDa("extracao")).toBe("claude-sonnet-5-5");
  });

  it("só pede fallback de recusa para os modelos que suportam", () => {
    expect(opcoesDeFallback("claude-haiku-5-5")).toEqual({});
    expect(opcoesDeFallback("claude-opus-5-5")).toMatchObject({ fallbacks: "default" });
  });

  it("estima custo pela tabela de preços", () => {
    // 480 mil tokens de entrada: US$ 1,92 no Opus 5.5; no Haiku 5.5, em prompts curtos, US$ 0,048.
    expect(custoEstimadoUsd("claude-opus-5-5", 480_000, 0)).toBeCloseTo(1.92, 6);
    expect(custoEstimadoUsd("claude-haiku-5-5", 48_000, 0) * 10).toBeCloseTo(0.048, 6);
    // Prompt acima de 100 mil tokens no Haiku usa a tarifa maior.
    expect(custoEstimadoUsd("claude-haiku-5-5", 200_000, 0)).toBeCloseTo(0.1, 6);
  });
});

describe("PDF lido localmente", () => {
  it("extrai a camada de texto de um PDF digital", async () => {
    const texto = await textoDoPdf(new Uint8Array(readFileSync("tests/fixtures/extrato-texto.pdf")));
    expect(texto).toContain("PIX RECEBIDO 1.500,00");
    expect(texto).toContain("Página 1");
  });

  it("devolve null para algo que não tem texto aproveitável", async () => {
    expect(await textoDoPdf(new TextEncoder().encode("%PDF-1.4 quebrado"))).toBeNull();
  });
});
