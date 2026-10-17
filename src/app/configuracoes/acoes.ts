"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CHAVE_PERFIL } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { configuracoes, regras } from "@/lib/db/schema";

export async function salvarPerfil(formData: FormData) {
  const valor = String(formData.get("perfil") ?? "").slice(0, 4000);
  await obterDb()
    .insert(configuracoes)
    .values({ chave: CHAVE_PERFIL, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
  revalidatePath("/configuracoes");
}

export async function excluirRegra(formData: FormData) {
  await obterDb().delete(regras).where(eq(regras.id, Number(formData.get("id"))));
  revalidatePath("/configuracoes");
}
