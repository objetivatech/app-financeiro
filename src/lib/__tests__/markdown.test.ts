import { describe, expect, it } from "vitest";
import { markdownSeguro } from "../markdown";

describe("markdown seguro", () => {
  it("formata o básico", () => {
    expect(markdownSeguro("**O que fazer agora**\n- pagar")).toContain("<strong>O que fazer agora</strong>");
  });
  it("não interpreta HTML nem links perigosos", () => {
    const html = markdownSeguro('<img src=x onerror=alert(1)> [clique](javascript:alert(1)) ![x](https://a/b.png) <script>alert(1)</script>');
    expect(html).not.toMatch(/<img|<script|href="javascript:/i);
    expect(html).toContain("clique");
  });
  it("mantém links do app e externos", () => {
    expect(markdownSeguro("[A pagar](/pagar)")).toContain('href="/pagar"');
    expect(markdownSeguro("[site](https://exemplo.com)")).toContain('rel="noopener noreferrer"');
  });
});
