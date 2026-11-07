/**
 * Cliente mínimo da Bot API do Telegram. O bot usa "long polling" (getUpdates): é o servidor do
 * app que pergunta ao Telegram se há mensagens, então nada precisa ficar exposto na internet (o
 * app continua atrás do Cloudflare Access). Token: TELEGRAM_BOT_TOKEN (BotFather).
 */

export class ErroTelegram extends Error {
  constructor(
    message: string,
    readonly codigo?: number,
  ) {
    super(message);
    this.name = "ErroTelegram";
  }
}

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function base(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ErroTelegram("TELEGRAM_BOT_TOKEN não configurado.");
  return `${(process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/$/, "")}/bot${token}`;
}

export async function chamar<T>(metodo: string, corpo: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const resposta = await fetch(`${base()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.any([AbortSignal.timeout(70_000), ...(signal ? [signal] : [])]),
  });
  const dados = (await resposta.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  // O token nunca aparece na mensagem de erro.
  if (!dados.ok) throw new ErroTelegram(`Telegram: ${dados.description ?? `HTTP ${resposta.status}`}`, dados.error_code ?? resposta.status);
  return dados.result as T;
}

export interface Atualizacao {
  update_id: number;
  message?: Mensagem;
}

export interface Mensagem {
  message_id: number;
  chat: { id: number; type: string; first_name?: string };
  from?: { id: number; first_name?: string };
  date: number;
  text?: string;
  caption?: string;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
}

/** Limite do Telegram por mensagem (4096); fica uma margem para a formatação. */
const LIMITE = 3800;

/** Divide um texto longo em partes, cortando em quebras de linha. */
export function dividir(texto: string): string[] {
  if (texto.length <= LIMITE) return [texto];
  const partes: string[] = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    if ((atual + "\n" + linha).length > LIMITE && atual) {
      partes.push(atual);
      atual = "";
    }
    atual = atual ? `${atual}\n${linha}` : linha.slice(0, LIMITE);
  }
  if (atual) partes.push(atual);
  return partes;
}

/** Envia uma mensagem em HTML (com as tags simples que o Telegram aceita). */
export async function enviar(chatId: number, html: string): Promise<void> {
  for (const parte of dividir(html)) {
    await chamar("sendMessage", { chat_id: chatId, text: parte, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
}

export async function digitando(chatId: number): Promise<void> {
  await chamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}

/** Baixa um arquivo enviado ao bot (o Telegram limita a 20 MB). */
export async function baixarArquivo(fileId: string): Promise<Uint8Array> {
  const info = await chamar<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.file_path) throw new ErroTelegram("O Telegram não liberou o arquivo (maior que 20 MB?).");
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const url = `${(process.env.TELEGRAM_API_URL ?? "https://api.telegram.org").replace(/\/$/, "")}/file/bot${token}/${info.file_path}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new ErroTelegram(`Não consegui baixar o arquivo (HTTP ${r.status}).`);
  return new Uint8Array(await r.arrayBuffer());
}
