import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { configuracoes } from "../db/schema";
import { ErroImportacao } from "./tipos";

/**
 * PDFs protegidos por senha (faturas de alguns bancos). O app descobre na leitura se o arquivo
 * pede senha; aí tenta as senhas que você mandou guardar e, se nenhuma servir, pede a senha na
 * tela de Importar. As senhas ficam cifradas no banco (AES-256-GCM, chave derivada do .env) e
 * nunca vão para a IA: o PDF é aberto no próprio servidor e só o texto segue adiante.
 */

export class ErroSenhaPdf extends ErroImportacao {
  constructor(readonly motivo: "pedir" | "incorreta") {
    super(motivo === "pedir" ? "Este PDF é protegido por senha." : "Senha incorreta. Confira e tente de novo.");
    this.name = "ErroSenhaPdf";
  }
}

const CHAVE_CONFIG = "senhas_pdf";
const MAX_GUARDADAS = 20;

function chave(): Buffer {
  // APP_SEGREDO (opcional) ou, na falta, o login do app: quem lê só o banco não lê as senhas.
  const segredo = process.env.APP_SEGREDO || process.env.APP_SENHA || process.env.DATABASE_URL || "financeiro-local";
  return createHash("sha256").update(`senhas-pdf:${segredo}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), corpo].map((b) => b.toString("base64")).join(".");
}

/** Devolve null se não der para decifrar (ex.: o segredo do .env mudou). */
export function decifrar(cifrado: string): string | null {
  try {
    const [iv, tag, corpo] = cifrado.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(corpo), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function ehErroDeSenha(erro: unknown): erro is { name: string; code?: number } {
  return typeof erro === "object" && erro !== null && (erro as { name?: string }).name === "PasswordException";
}

/** Tenta abrir o PDF com uma senha (ou sem): "ok", "senha" (pede/está errada) ou "outro" (arquivo com outro problema). */
async function tentarAbrir(bytes: Uint8Array, senha?: string): Promise<"ok" | "senha" | "outro"> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes), senha ? { password: senha } : {});
    await pdf.cleanup?.();
    return "ok";
  } catch (erro) {
    return ehErroDeSenha(erro) ? "senha" : "outro";
  }
}

/**
 * Descobre se o PDF precisa de senha e qual das candidatas abre. Devolve a senha que serviu (null
 * se o arquivo não tem senha). Sem nenhuma que sirva, lança ErroSenhaPdf ("incorreta" quando você
 * acabou de digitar uma).
 */
export async function senhaDoPdf(bytes: Uint8Array, candidatas: { informada?: string | null; guardadas?: string[] } = {}): Promise<string | null> {
  if ((await tentarAbrir(bytes)) !== "senha") return null;
  const lista = [candidatas.informada, ...(candidatas.guardadas ?? [])].filter((s): s is string => Boolean(s));
  for (const s of new Set(lista)) if ((await tentarAbrir(bytes, s)) === "ok") return s;
  throw new ErroSenhaPdf(candidatas.informada ? "incorreta" : "pedir");
}

export async function senhasGuardadas(db: Db): Promise<string[]> {
  const linha = await db.query.configuracoes.findFirst({ where: eq(configuracoes.chave, CHAVE_CONFIG) });
  const lista = Array.isArray(linha?.valor) ? (linha.valor as string[]) : [];
  return lista.map(decifrar).filter((s): s is string => s !== null);
}

export async function guardarSenha(db: Db, senha: string): Promise<void> {
  const atuais = await senhasGuardadas(db);
  if (atuais.includes(senha)) return;
  // A mais recente primeiro: é a que tem mais chance de servir no próximo arquivo.
  const valor = [senha, ...atuais].slice(0, MAX_GUARDADAS).map(cifrar);
  await db
    .insert(configuracoes)
    .values({ chave: CHAVE_CONFIG, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
}

export async function apagarSenhasGuardadas(db: Db): Promise<void> {
  await db.delete(configuracoes).where(eq(configuracoes.chave, CHAVE_CONFIG));
}
