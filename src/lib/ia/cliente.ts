import Anthropic from "@anthropic-ai/sdk";

/** Modelo padrão para extração, classificação e insights. Pode ser trocado por variável de ambiente. */
export const MODELO_IA = process.env.MODELO_IA ?? "claude-opus-5-5";

/** Beta que habilita `fallbacks: "default"`: se o modelo recusar, a API tenta outro modelo automaticamente. */
export const BETA_FALLBACK = "server-side-fallback-2026-07-01";

let cliente: Anthropic | undefined;

export function iaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function obterClienteIa(): Anthropic {
  cliente ??= new Anthropic();
  return cliente;
}

export class ErroIa extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroIa";
  }
}
