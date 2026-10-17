import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { INSTITUICOES, instituicaoPorTexto } from "../instituicoes/catalogo";
import type { ExtratoNormalizado, FormatoArquivo } from "../importacao/tipos";
import { parseData } from "../importacao/util";
import { BETA_FALLBACK, ErroIa, MODELO_IA, obterClienteIa } from "./cliente";

const EsquemaExtrato = z.object({
  instituicao_nome: z.string().nullable().describe("Nome do banco/instituição/emissor como aparece no documento"),
  instituicao_id: z
    .string()
    .nullable()
    .describe("id do catálogo de instituições, se for uma delas; senão null"),
  tipo_conta: z.enum(["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"]).nullable(),
  titular: z.string().nullable(),
  documento_titular: z.string().nullable().describe("CPF ou CNPJ do titular, só dígitos, se aparecer"),
  agencia: z.string().nullable(),
  numero_conta: z.string().nullable(),
  final_cartao: z.string().nullable().describe("Últimos 4 dígitos do cartão, se for fatura"),
  periodo_inicio: z.string().nullable().describe("AAAA-MM-DD"),
  periodo_fim: z.string().nullable().describe("AAAA-MM-DD"),
  saldo_final: z.number().nullable().describe("Saldo final em reais (ou total da fatura, negativo), se aparecer"),
  moeda: z.string().describe("Código ISO da moeda, ex.: BRL"),
  transacoes: z.array(
    z.object({
      data: z.string().describe("AAAA-MM-DD"),
      descricao: z.string(),
      valor: z.number().describe("Em reais. Positivo = entrada de dinheiro; negativo = saída/compra"),
      nome_contraparte: z.string().nullable(),
      documento_contraparte: z.string().nullable().describe("CPF/CNPJ da contraparte, só dígitos, se aparecer"),
      parcela_atual: z.number().int().nullable(),
      parcela_total: z.number().int().nullable(),
    }),
  ),
  observacoes: z.string().nullable().describe("Qualquer coisa ilegível, cortada ou duvidosa"),
});

const SISTEMA = `Você extrai dados de extratos bancários e faturas de cartão brasileiros com precisão contábil.

Regras:
- Transcreva TODAS as transações do documento, na ordem em que aparecem. Não resuma, não agrupe, não invente.
- Não inclua linhas de saldo (saldo anterior, saldo do dia, saldo final) nem totais como transações.
- Sinal: entrada de dinheiro = positivo; saída = negativo. Em fatura de cartão, compras e tarifas são negativas; pagamentos da fatura, estornos e créditos são positivos.
- Datas em AAAA-MM-DD. Se o documento só mostra dia/mês, deduza o ano pelo período do extrato ou da fatura.
- Compras parceladas ("03/10", "Parc 3 de 10"): preencha parcela_atual e parcela_total.
- Em Pix/TED, quando o extrato mostra o nome ou CPF/CNPJ de quem enviou ou recebeu, preencha a contraparte.
- Se algo estiver ilegível ou cortado, diga em "observacoes" em vez de adivinhar.

Catálogo de instituições conhecidas (id: nome):
${INSTITUICOES.map((i) => `${i.id}: ${i.nome}`).join("\n")}`;

export interface EntradaExtracao {
  formato: Extract<FormatoArquivo, "pdf" | "imagem" | "csv">;
  bytes: Uint8Array;
  mimeType: string;
  nomeArquivo: string;
  /** Para CSV: o texto já decodificado. */
  texto?: string;
}

function blocoDocumento(entrada: EntradaExtracao): Anthropic.Beta.BetaContentBlockParam {
  const base64 = Buffer.from(entrada.bytes).toString("base64");
  if (entrada.formato === "pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  if (entrada.formato === "imagem") {
    const mime = entrada.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    return { type: "image", source: { type: "base64", media_type: mime, data: base64 } };
  }
  return { type: "text", text: `Conteúdo do arquivo CSV "${entrada.nomeArquivo}":\n\n${entrada.texto ?? ""}` };
}

/**
 * Extrai transações de PDF, imagem ou CSV não reconhecido usando o Claude com saída estruturada.
 * Usa streaming porque extratos longos geram respostas grandes.
 */
export async function extrairComIa(entrada: EntradaExtracao): Promise<ExtratoNormalizado> {
  const cliente = obterClienteIa();
  const stream = cliente.beta.messages.stream({
    model: MODELO_IA,
    max_tokens: 64000,
    betas: [BETA_FALLBACK],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(EsquemaExtrato) },
    system: SISTEMA,
    messages: [
      {
        role: "user",
        content: [
          blocoDocumento(entrada),
          { type: "text", text: `Nome do arquivo: ${entrada.nomeArquivo}\nExtraia o extrato completo.` },
        ],
      },
    ],
  });
  const resposta = await stream.finalMessage();

  if (resposta.stop_reason === "refusal") {
    throw new ErroIa("A IA recusou processar este documento.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new ErroIa("O documento é longo demais para uma extração só. Divida o arquivo (ex.: por mês) e importe de novo.");
  }
  const dados = resposta.parsed_output;
  if (!dados) throw new ErroIa("A IA não devolveu dados no formato esperado.");

  const avisos: string[] = [];
  if (dados.observacoes) avisos.push(`IA: ${dados.observacoes}`);

  const transacoes = dados.transacoes.flatMap((t) => {
    const data = parseData(t.data);
    if (!data || !Number.isFinite(t.valor)) {
      avisos.push(`Transação descartada (data/valor inválidos): ${t.data} ${t.descricao}`);
      return [];
    }
    return [
      {
        data,
        descricao: t.descricao,
        valorCentavos: Math.round(t.valor * 100),
        nomeContraparte: t.nome_contraparte ?? undefined,
        documentoContraparte: t.documento_contraparte?.replace(/\D/g, "") || undefined,
        parcela: t.parcela_atual && t.parcela_total ? { atual: t.parcela_atual, total: t.parcela_total } : undefined,
      },
    ];
  });

  const idValido = INSTITUICOES.some((i) => i.id === dados.instituicao_id) ? dados.instituicao_id : null;
  const instituicaoId =
    idValido ?? (dados.instituicao_nome ? instituicaoPorTexto(dados.instituicao_nome)?.id : undefined);
  const inicio = dados.periodo_inicio ? parseData(dados.periodo_inicio) : null;
  const fim = dados.periodo_fim ? parseData(dados.periodo_fim) : null;

  return {
    formato: entrada.formato,
    instituicaoId: instituicaoId ?? undefined,
    instituicaoNomeLido: dados.instituicao_nome ?? undefined,
    conta: {
      tipo: dados.tipo_conta ?? undefined,
      titular: dados.titular ?? undefined,
      documentoTitular: dados.documento_titular?.replace(/\D/g, "") || undefined,
      agencia: dados.agencia ?? undefined,
      numero: dados.numero_conta ?? undefined,
      finalCartao: dados.final_cartao ?? undefined,
    },
    periodo: inicio && fim ? { inicio, fim } : undefined,
    saldoFinalCentavos: dados.saldo_final !== null ? Math.round(dados.saldo_final * 100) : undefined,
    moeda: dados.moeda || "BRL",
    transacoes,
    avisos,
    extraidoPor: "ia",
  };
}
