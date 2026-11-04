import Anthropic from "@anthropic-ai/sdk";

/**
 * Cada tarefa usa o modelo que equilibra custo e qualidade para ela:
 * - extração (ler PDF/foto/CSV) e classificação são volume: Haiku, ~40× mais barato que o Opus;
 * - a análise mensal é pouca chamada e pede mais raciocínio: Opus.
 * Todos podem ser trocados por variável de ambiente.
 */
export type TarefaIa = "extracao" | "classificacao" | "analise" | "consultor" | "carta";

/**
 * O consultor (chat) usa o Sonnet 5.5: conversa com várias consultas por pergunta, então custo por
 * mensagem importa; a carta semanal é uma chamada por semana e usa o mesmo modelo da análise.
 */
const PADRAO: Record<TarefaIa, string> = {
  extracao: "claude-haiku-5-5",
  classificacao: "claude-haiku-5-5",
  analise: "claude-opus-5-5",
  consultor: "claude-sonnet-5-5",
  carta: "claude-opus-5-5",
};

const VARIAVEL: Record<TarefaIa, string> = {
  extracao: "MODELO_EXTRACAO",
  classificacao: "MODELO_CLASSIFICACAO",
  analise: "MODELO_ANALISE",
  consultor: "MODELO_CONSULTOR",
  carta: "MODELO_ANALISE",
};

export function modeloDa(tarefa: TarefaIa): string {
  return process.env[VARIAVEL[tarefa]] || PADRAO[tarefa];
}

/**
 * Fallback automático em caso de recusa (beta `fallbacks: "default"`): só existe para os modelos
 * maiores. Enviar o parâmetro para o Haiku daria erro.
 */
export function opcoesDeFallback(modelo: string): { betas?: string[]; fallbacks?: "default" } {
  if (/^claude-(opus-5|fable-5|sonnet-5-5)/.test(modelo)) {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  }
  return {};
}

/** Preço por milhão de tokens (US$), tabela de 2026. Usado só para estimar custo na tela. */
const PRECOS: { prefixo: string; entrada: number; saida: number; entradaLonga?: number; saidaLonga?: number }[] = [
  { prefixo: "claude-haiku-5-5", entrada: 0.1, saida: 0.5, entradaLonga: 0.5, saidaLonga: 2.5 },
  { prefixo: "claude-sonnet-5", entrada: 2, saida: 10 },
  { prefixo: "claude-sonnet-4", entrada: 3, saida: 15 },
  { prefixo: "claude-opus-5-5", entrada: 4, saida: 20 },
  { prefixo: "claude-opus", entrada: 5, saida: 25 },
  { prefixo: "claude-fable", entrada: 10, saida: 50 },
];

export function custoEstimadoUsd(modelo: string, entrada: number, saida: number, cacheLeitura = 0): number {
  const p = PRECOS.find((x) => modelo.startsWith(x.prefixo));
  if (!p) return 0;
  // O Haiku 5.5 tem tarifa maior para prompts acima de 100 mil tokens.
  const longo = entrada + cacheLeitura > 100_000 && p.entradaLonga !== undefined;
  const pe = longo ? p.entradaLonga! : p.entrada;
  const ps = longo ? p.saidaLonga! : p.saida;
  return (entrada * pe + cacheLeitura * pe * 0.1 + saida * ps) / 1_000_000;
}

let cliente: Anthropic | undefined;

export function iaDisponivel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function obterClienteIa(): Anthropic {
  cliente ??= new Anthropic();
  return cliente;
}

/** Para testes: recria o cliente na próxima chamada (ex.: outra ANTHROPIC_BASE_URL). */
export function redefinirClienteIa(): void {
  cliente = undefined;
}

export class ErroIa extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroIa";
  }
}

/**
 * Registra o consumo de uma chamada (para a tela de custos). Nunca derruba a tarefa:
 * se o banco não estiver disponível (ex.: testes), apenas ignora.
 */
export async function registrarUso(
  tarefa: TarefaIa,
  modelo: string,
  uso: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined,
): Promise<void> {
  if (!uso || !process.env.DATABASE_URL) return;
  try {
    const { obterDb } = await import("../db");
    const { usoIa } = await import("../db/schema");
    const entrada = uso.input_tokens ?? 0;
    const saida = uso.output_tokens ?? 0;
    const cache = uso.cache_read_input_tokens ?? 0;
    await obterDb()
      .insert(usoIa)
      .values({
        tarefa,
        modelo,
        tokensEntrada: entrada,
        tokensSaida: saida,
        tokensCache: cache,
        custoMicroUsd: Math.round(custoEstimadoUsd(modelo, entrada, saida, cache) * 1_000_000),
      });
  } catch (erro) {
    console.error("Não foi possível registrar o uso da IA", erro);
  }
}
