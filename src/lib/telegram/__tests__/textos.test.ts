import { describe, expect, it } from "vitest";
import { dividir } from "../api";
import { markdownParaTelegram, textoAPagar, textoBomDia } from "../textos";

describe("mensagens do bot", () => {
  it("converte o markdown do consultor para o HTML do Telegram e escapa o resto", () => {
    expect(markdownParaTelegram("## Resumo\n**O que fazer agora**: pagar <já>\n- item 1\n- item 2")).toBe(
      "<b>Resumo</b>\n<b>O que fazer agora</b>: pagar &lt;já&gt;\n• item 1\n• item 2",
    );
  });

  it("divide textos longos em partes que o Telegram aceita, sem cortar linhas", () => {
    const linhas = Array.from({ length: 400 }, (_, i) => `linha ${i} ${"x".repeat(20)}`);
    const partes = dividir(linhas.join("\n"));
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 3800)).toBe(true);
    expect(partes.join("\n")).toBe(linhas.join("\n"));
  });

  it("a pagar destaca o atrasado e o de hoje", () => {
    const t = textoAPagar(
      [
        { descricao: "DAS", valorCentavos: 45_832, vencimento: "2026-11-19", status: "aberto", escopo: "PJ" },
        { descricao: "Luz", valorCentavos: 10_000, vencimento: "2026-11-01", status: "vencido", escopo: "PF" },
      ],
      "2026-11-19",
    );
    expect(t).toMatch(/❗ hoje — DAS/);
    expect(t).toMatch(/⛔ venceu — Luz/);
  });

  it("bom dia só sai quando há algo para pagar", () => {
    expect(textoBomDia("2026-11-19", [], 0)).toBeNull();
    expect(textoBomDia("2026-11-19", [{ descricao: "DAS", valorCentavos: 100, vencimento: "2026-11-19" }], 0)).toMatch(/hoje — DAS/);
  });
});
