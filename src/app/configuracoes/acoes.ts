"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CHAVE_PERFIL } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { configuracoes, regras } from "@/lib/db/schema";
import { salvarPerfilFiscal } from "@/lib/fiscal/perfil";
import { parseValorCentavos } from "@/lib/importacao/util";

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

export async function salvarDadosFiscais(formData: FormData) {
  const dinheiro = (campo: string) => Math.max(0, parseValorCentavos(String(formData.get(campo) ?? "")) ?? 0);
  await salvarPerfilFiscal(obterDb(), {
    proLaboreMensalCentavos: dinheiro("proLabore"),
    custoFixoPjCentavos: dinheiro("custoFixo"),
    sujeitoFatorR: formData.get("sujeitoFatorR") === "on",
    emailResumo: String(formData.get("emailResumo") ?? "").trim().slice(0, 200),
  });
  revalidatePath("/configuracoes");
  revalidatePath("/impostos");
  revalidatePath("/");
}
