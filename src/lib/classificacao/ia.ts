import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BETA_FALLBACK, ErroIa, MODELO_IA, obterClienteIa } from "../ia/cliente";
import type { Escopo, TipoConta } from "../importacao/tipos";
import { CATEGORIAS_PADRAO } from "./categorias";

export interface ItemParaIa {
  id: number;
  data: string;
  descricao: string;
  valorCentavos: number;
  nomeContraparte: string | null;
  conta: { apelido: string; tipo: TipoConta; escopoPadrao: Escopo | "misto" };
}

const idsCategorias = CATEGORIAS_PADRAO.map((c) => c.id) as [string, ...string[]];

const EsquemaClassificacao = z.object({
  itens: z.array(
    z.object({
      id: z.number().int(),
      categoria_id: z.enum(idsCategorias),
      escopo: z.enum(["PF", "PJ"]).describe("De quem é a receita/despesa, independentemente da conta usada"),
      confianca: z.number().describe("0 a 1"),
      motivo: z.string().describe("Justificativa curta, até 12 palavras"),
    }),
  ),
});

export type ClassificacaoIa = z.infer<typeof EsquemaClassificacao>["itens"][number];

const TAMANHO_LOTE = 80;

function sistema(perfil: string): string {
  return `Você classifica transações financeiras de um empresário brasileiro que mistura contas pessoais (PF) e da empresa (PJ).

Sobre o usuário e a empresa:
${perfil || "Sócio de uma empresa do Simples Nacional. (Sem mais detalhes cadastrados.)"}

Para cada transação, decida:
1. categoria_id: uma das categorias abaixo.
2. escopo: PF se a receita/despesa é da vida pessoal; PJ se é da operação da empresa. Decida pela NATUREZA do gasto, não pela conta: almoço de família pago no cartão da empresa é PF; ferramenta de trabalho paga no cartão pessoal é PJ. Use o escopo padrão da conta como pista quando a descrição for ambígua.
3. confianca: quão seguro você está (0 a 1). Use menos de 0.6 quando a descrição for genérica (ex.: "PIX ENVIADO FULANO").
4. motivo: justificativa curta.

Categorias (id: nome [escopo]):
${CATEGORIAS_PADRAO.map((c) => `${c.id}: ${c.nome} [${c.escopo ?? "ambos"}]`).join("\n")}`;
}

/** Classifica transações em lotes. Nunca envia CPF/CNPJ: só data, descrição, valor e o tipo da conta. */
export async function classificarComIa(itens: ItemParaIa[], perfil: string): Promise<ClassificacaoIa[]> {
  const cliente = obterClienteIa();
  const resultado: ClassificacaoIa[] = [];

  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    const lote = itens.slice(i, i + TAMANHO_LOTE);
    const linhas = lote.map((t) =>
      JSON.stringify({
        id: t.id,
        data: t.data,
        descricao: t.descricao,
        valor: (t.valorCentavos / 100).toFixed(2),
        contraparte: t.nomeContraparte ?? undefined,
        conta: `${t.conta.apelido} (${t.conta.tipo}, padrão ${t.conta.escopoPadrao})`,
      }),
    );
    const resposta = await cliente.beta.messages.parse({
      model: MODELO_IA,
      max_tokens: 16000,
      betas: [BETA_FALLBACK],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(EsquemaClassificacao) },
      system: sistema(perfil),
      messages: [
        {
          role: "user",
          content: `Classifique as ${lote.length} transações (valor negativo = saída):\n${linhas.join("\n")}`,
        },
      ],
    });
    if (resposta.stop_reason === "refusal") throw new ErroIa("A IA recusou classificar este lote.");
    if (!resposta.parsed_output) throw new ErroIa("A IA não devolveu a classificação no formato esperado.");

    const idsDoLote = new Set(lote.map((t) => t.id));
    resultado.push(...resposta.parsed_output.itens.filter((c) => idsDoLote.has(c.id)));
  }
  return resultado;
}
