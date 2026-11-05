import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { INSTITUICOES, instituicaoPorTexto } from "../instituicoes/catalogo";
import type { ExtratoNormalizado, FormatoArquivo } from "../importacao/tipos";
import { parseData } from "../importacao/util";
import { ErroIa, modeloDa, obterClienteIa, opcoesDeFallback, registrarUso } from "./cliente";

/**
 * Esquema da leitura por IA. A API de saída estruturada aceita no máximo 16 campos opcionais
 * (nullable/union) por esquema: textos ausentes vêm como "" e só números/enum usam null.
 */
export const EsquemaExtrato = z.object({
  instituicao_nome: z.string().describe("Nome do banco/instituição/emissor como aparece no documento; vazio se não houver"),
  instituicao_id: z
    .string()
    .describe("id do catálogo de instituições, se for uma delas; senão vazio"),
  tipo_conta: z.enum(["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"]).nullable(),
  titular: z.string().describe("vazio se não houver"),
  documento_titular: z.string().describe("CPF ou CNPJ do titular, só dígitos, se aparecer; vazio se não houver"),
  agencia: z.string().describe("vazio se não houver"),
  numero_conta: z.string().describe("vazio se não houver"),
  final_cartao: z.string().describe("Últimos 4 dígitos do cartão, se for fatura; vazio se não houver"),
  periodo_inicio: z.string().describe("AAAA-MM-DD; vazio se não houver"),
  periodo_fim: z.string().describe("AAAA-MM-DD; vazio se não houver"),
  saldo_final: z.number().nullable().describe("Saldo final em reais (ou total da fatura, negativo), se aparecer"),
  moeda: z.string().describe("Código ISO da moeda, ex.: BRL"),
  fatura_vencimento: z.string().describe("Só em fatura de cartão: data de vencimento, AAAA-MM-DD; vazio se não houver"),
  fatura_fechamento: z.string().describe("Só em fatura de cartão: data de fechamento/corte, AAAA-MM-DD; vazio se não houver"),
  fatura_total: z.number().nullable().describe("Só em fatura de cartão: total a pagar em reais, positivo"),
  fatura_minimo: z.number().nullable().describe("Só em fatura de cartão: pagamento mínimo em reais, positivo"),
  transacoes: z.array(
    z.object({
      data: z.string().describe("AAAA-MM-DD"),
      descricao: z.string(),
      valor: z.number().describe("Em reais. Positivo = entrada de dinheiro; negativo = saída/compra"),
      nome_contraparte: z.string().describe("vazio se não houver"),
      documento_contraparte: z.string().describe("CPF/CNPJ da contraparte, só dígitos, se aparecer; vazio se não houver"),
      parcela_atual: z.number().int().nullable(),
      final_cartao: z.string().describe("Fatura: últimos 4 dígitos do cartão desta compra (físico, virtual ou adicional), quando a fatura separa por cartão; vazio se não houver"),
      parcela_total: z.number().int().nullable(),
    }),
  ),
  observacoes: z.string().describe("Qualquer coisa ilegível, cortada ou duvidosa; vazio se não houver"),
});

const SISTEMA = `Você extrai dados de extratos bancários e faturas de cartão brasileiros com precisão contábil.

Regras:
- Transcreva TODAS as transações do documento, na ordem em que aparecem. Não resuma, não agrupe, não invente.
- Não inclua linhas de saldo (saldo anterior, saldo do dia, saldo final) nem totais como transações.
- Sinal: entrada de dinheiro = positivo; saída = negativo. Em fatura de cartão, compras e tarifas são negativas; pagamentos da fatura, estornos e créditos são positivos.
- Datas em AAAA-MM-DD. Se o documento só mostra dia/mês, deduza o ano pelo período do extrato ou da fatura.
- Compras parceladas ("03/10", "Parc 3 de 10"): preencha parcela_atual e parcela_total.
- Faturas costumam separar os lançamentos por cartão (físico, virtuais, adicionais): preencha final_cartao de cada compra com os 4 dígitos do cartão daquela seção.
- Em fatura de cartão, preencha vencimento, fechamento, total a pagar e pagamento mínimo da fatura atual. Não transcreva como transação o resumo de "próximas faturas"/"compras parceladas a vencer": só os lançamentos desta fatura.
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
  /** Permite interromper a leitura no meio (botão "Cancelar fila"). */
  signal?: AbortSignal;
}

/**
 * Texto da camada digital do PDF (extratos baixados do banco quase sempre têm).
 * Mandar só o texto custa uma fração de mandar o PDF inteiro, que vai com a imagem de cada página.
 * PDF escaneado (sem texto) volta null e segue como documento.
 */
export async function textoDoPdf(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const paginas = (Array.isArray(text) ? text : [text]).map((t, i) => `--- Página ${i + 1} ---\n${t.trim()}`);
    const tudo = paginas.join("\n\n");
    // Pouco texto ou sem números: provavelmente escaneado ou só imagens.
    const digitos = (tudo.match(/\d/g) ?? []).length;
    return tudo.replace(/--- Página \d+ ---/g, "").trim().length >= 80 && digitos >= 10 ? tudo : null;
  } catch {
    return null;
  }
}

async function blocoDocumento(entrada: EntradaExtracao): Promise<{ bloco: Anthropic.Beta.BetaContentBlockParam; comoTexto: boolean }> {
  if (entrada.formato === "pdf") {
    const texto = await textoDoPdf(entrada.bytes);
    if (texto) {
      return { bloco: { type: "text", text: `Texto extraído do PDF "${entrada.nomeArquivo}":\n\n${texto}` }, comoTexto: true };
    }
    const base64 = Buffer.from(entrada.bytes).toString("base64");
    return { bloco: { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, comoTexto: false };
  }
  if (entrada.formato === "imagem") {
    const base64 = Buffer.from(entrada.bytes).toString("base64");
    const mime = entrada.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    return { bloco: { type: "image", source: { type: "base64", media_type: mime, data: base64 } }, comoTexto: false };
  }
  return { bloco: { type: "text", text: `Conteúdo do arquivo CSV "${entrada.nomeArquivo}":\n\n${entrada.texto ?? ""}` }, comoTexto: true };
}

/**
 * Extrai transações de PDF, imagem ou CSV não reconhecido usando o Claude com saída estruturada.
 * Usa streaming porque extratos longos geram respostas grandes.
 */
export async function extrairComIa(entrada: EntradaExtracao): Promise<ExtratoNormalizado> {
  const cliente = obterClienteIa();
  const modelo = modeloDa("extracao");
  const { bloco } = await blocoDocumento(entrada);
  const stream = cliente.beta.messages.stream({
    model: modelo,
    max_tokens: 64000,
    ...opcoesDeFallback(modelo),
    // Transcrever um extrato não exige raciocínio longo: esforço baixo deixa a leitura rápida e barata.
    output_config: { effort: "low", format: betaZodOutputFormat(EsquemaExtrato) },
    system: SISTEMA,
    messages: [
      {
        role: "user",
        content: [
          bloco,
          { type: "text", text: `Nome do arquivo: ${entrada.nomeArquivo}\nExtraia o extrato completo.` },
        ],
      },
    ],
  }, { signal: entrada.signal });
  const resposta = await stream.finalMessage();
  await registrarUso("extracao", modelo, resposta.usage);

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
        nomeContraparte: t.nome_contraparte.trim() || undefined,
        documentoContraparte: t.documento_contraparte.replace(/\D/g, "") || undefined,
        parcela: t.parcela_atual && t.parcela_total ? { atual: t.parcela_atual, total: t.parcela_total } : undefined,
        finalCartao: t.final_cartao.replace(/\D/g, "").slice(-4) || undefined,
      },
    ];
  });

  const idValido = INSTITUICOES.some((i) => i.id === dados.instituicao_id) ? dados.instituicao_id : null;
  const instituicaoId =
    idValido ?? (dados.instituicao_nome ? instituicaoPorTexto(dados.instituicao_nome)?.id : undefined);
  const inicio = dados.periodo_inicio ? parseData(dados.periodo_inicio) : null;
  const fim = dados.periodo_fim ? parseData(dados.periodo_fim) : null;

  const vencimentoFatura = dados.fatura_vencimento ? parseData(dados.fatura_vencimento) : null;
  const fechamentoFatura = dados.fatura_fechamento ? parseData(dados.fatura_fechamento) : null;
  const fatura =
    vencimentoFatura && dados.fatura_total !== null && Number.isFinite(dados.fatura_total)
      ? {
          vencimento: vencimentoFatura,
          fechamento: fechamentoFatura ?? undefined,
          totalCentavos: Math.round(Math.abs(dados.fatura_total) * 100),
          minimoCentavos: dados.fatura_minimo !== null ? Math.round(Math.abs(dados.fatura_minimo) * 100) : undefined,
        }
      : undefined;

  return {
    formato: entrada.formato,
    fatura,
    instituicaoId: instituicaoId ?? undefined,
    instituicaoNomeLido: dados.instituicao_nome.trim() || undefined,
    conta: {
      tipo: dados.tipo_conta ?? undefined,
      titular: dados.titular.trim() || undefined,
      documentoTitular: dados.documento_titular.replace(/\D/g, "") || undefined,
      agencia: dados.agencia.trim() || undefined,
      numero: dados.numero_conta.trim() || undefined,
      finalCartao: dados.final_cartao.replace(/\D/g, "").slice(-4) || undefined,
    },
    periodo: inicio && fim ? { inicio, fim } : undefined,
    saldoFinalCentavos: dados.saldo_final !== null ? Math.round(dados.saldo_final * 100) : undefined,
    moeda: dados.moeda || "BRL",
    transacoes,
    avisos,
    extraidoPor: "ia",
  };
}
