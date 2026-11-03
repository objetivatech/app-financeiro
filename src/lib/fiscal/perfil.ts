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
});

export type PerfilFiscal = z.infer<typeof EsquemaPerfilFiscal>;

export async function obterPerfilFiscal(db: Db): Promise<PerfilFiscal> {
  const linha = await db.query.configuracoes.findFirst({ where: eq(configuracoes.chave, CHAVE_PERFIL_FISCAL) });
  const lido = EsquemaPerfilFiscal.safeParse(linha?.valor ?? {});
  return lido.success ? lido.data : EsquemaPerfilFiscal.parse({});
}

export async function salvarPerfilFiscal(db: Db, perfil: PerfilFiscal): Promise<void> {
  const valor = EsquemaPerfilFiscal.parse(perfil);
  await db
    .insert(configuracoes)
    .values({ chave: CHAVE_PERFIL_FISCAL, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
}
