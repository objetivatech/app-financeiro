import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { EsquemaClassificacao } from "../../classificacao/ia";
import { EsquemaCarta } from "../../consultor/carta";
import { EsquemaAnalise } from "../analise";
import { EsquemaExtrato } from "../extrator";

/** Conta os campos com união (anyOf/oneOf ou "type" com vários tipos), como a API conta. */
function camposComUniao(no: unknown): number {
  if (!no || typeof no !== "object") return 0;
  if (Array.isArray(no)) return no.reduce((t, n) => t + camposComUniao(n), 0);
  const o = no as Record<string, unknown>;
  const aqui = o.anyOf || o.oneOf || (Array.isArray(o.type) && o.type.length > 1) ? 1 : 0;
  return aqui + Object.values(o).reduce<number>((t, v) => t + camposComUniao(v), 0);
}

describe("esquemas de saída estruturada da IA", () => {
  // A API recusa (400) esquemas com mais de 16 parâmetros com união/nullable.
  it.each([
    ["extração de extratos", EsquemaExtrato],
    ["classificação", EsquemaClassificacao],
    ["análise do mês", EsquemaAnalise],
    ["carta da semana", EsquemaCarta],
  ])("%s fica dentro do limite de 16 campos opcionais", (_, esquema) => {
    const formato = betaZodOutputFormat(esquema as never) as unknown as { schema: unknown };
    expect(camposComUniao(formato.schema)).toBeLessThanOrEqual(16);
  });
});
