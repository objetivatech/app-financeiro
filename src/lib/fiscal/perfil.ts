import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import { configuracoes } from "../db/schema";

export const CHAVE_PERFIL_FISCAL = "perfil_fiscal";

export const EsquemaPerfilFiscal = z.object({
  /** Pró-labore mensal definido (base do INSS de 11% e da folha do Fator R). */
  proLaboreMensalCentavos: z.number().int().nonnegative().default(0),
  /** A atividade principal (a das notas) está sujeita ao Fator R (Anexo III/V)? */
  sujeitoFatorR: z.boolean().default(true),
  /** Custo fixo mensal da empresa, incluindo o pró-labore (base da reserva de caixa da PJ). */
  custoFixoPjCentavos: z.number().int().nonnegative().default(0),
  /** Para onde vão os resumos por e-mail. */
  emailResumo: z.string().default(""),
  /** Seu nome como aparece nos Pix/TED (para reconhecer retiradas e aportes). */
  nomeSocio: z.string().default(""),
  /** Seu CPF, só dígitos (opcional). Fica só no banco do app; nunca vai para a IA. */
  cpfSocio: z.string().default(""),
  /** Nomes da empresa como aparecem nos Pix (razão social, nome fantasia). */
  nomesEmpresa: z.array(z.string()).default([]),
  /**
   * Enquadramentos da empresa ao longo do tempo (ex.: MEI até ago/2026, Simples/ME desde set/2026).
   * Vazio = sempre no Simples (ME/EPP).
   */
  regimes: z.array(z.object({ regime: z.enum(["mei", "simples"]), inicio: z.string().regex(/^\d{4}-\d{2}$/) })).default([]),
  /** Mês em que o pró-labore começou (AAAA-MM). Vazio = considera os 12 meses. */
  proLaboreDesde: z.string().default(""),
});

export type PerfilFiscal = z.infer<typeof EsquemaPerfilFiscal>;

export async function obterPerfilFiscal(db: Db): Promise<PerfilFiscal> {
  const linha = await db.query.configuracoes.findFirst({ where: eq(configuracoes.chave, CHAVE_PERFIL_FISCAL) });
  const lido = EsquemaPerfilFiscal.safeParse(linha?.valor ?? {});
  return lido.success ? lido.data : EsquemaPerfilFiscal.parse({});
}

/** Mês (AAAA-MM) até o qual a empresa foi MEI, se houver (lido do histórico de enquadramento). */
export function meiAte(perfil: PerfilFiscal): string | null {
  const simples = perfil.regimes.filter((r) => r.regime === "simples").map((r) => r.inicio).sort();
  const teveMei = perfil.regimes.some((r) => r.regime === "mei");
  if (!teveMei || simples.length === 0) return null;
  const [a, m] = simples[0].split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

/** Regime em vigor num mês. Sem histórico, sempre "simples". */
export function regimeNoMes(perfil: PerfilFiscal, mes: string): "mei" | "simples" {
  const vigente = [...perfil.regimes].filter((r) => r.inicio <= mes).sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
  return vigente?.regime ?? (perfil.regimes.length ? perfil.regimes.slice().sort((a, b) => a.inicio.localeCompare(b.inicio))[0].regime : "simples");
}

export async function salvarPerfilFiscal(db: Db, perfil: z.input<typeof EsquemaPerfilFiscal>): Promise<void> {
  const valor = EsquemaPerfilFiscal.parse(perfil);
  await db
    .insert(configuracoes)
    .values({ chave: CHAVE_PERFIL_FISCAL, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
}
