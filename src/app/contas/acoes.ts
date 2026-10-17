"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { classificarPendentes, reabrirClassificacaoDaConta } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { contas, importacoes } from "@/lib/db/schema";

const ESCOPOS = ["PF", "PJ", "misto"] as const;
const TIPOS = ["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"] as const;

export async function salvarConta(formData: FormData) {
  const db = obterDb();
  const id = Number(formData.get("id"));
  const atual = await db.query.contas.findFirst({ where: eq(contas.id, id) });
  if (!atual) return;

  const escopo = ESCOPOS.find((e) => e === formData.get("escopoPadrao")) ?? atual.escopoPadrao;
  const tipo = TIPOS.find((t) => t === formData.get("tipo")) ?? atual.tipo;
  await db
    .update(contas)
    .set({
      apelido: String(formData.get("apelido") || atual.apelido).slice(0, 80),
      escopoPadrao: escopo,
      tipo,
      ativa: formData.get("ativa") === "on",
      candidataEncerrar: formData.get("candidataEncerrar") === "on",
      observacao: String(formData.get("observacao") ?? "").slice(0, 500) || null,
    })
    .where(eq(contas.id, id));

  // Mudou de quem é a conta (ou o tipo): refaz a classificação automática dela.
  if (escopo !== atual.escopoPadrao || tipo !== atual.tipo) {
    await reabrirClassificacaoDaConta(db, id);
    await classificarPendentes(db);
  }
  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
}

export async function excluirConta(formData: FormData) {
  if (formData.get("confirmar") !== "on") return;
  const db = obterDb();
  const id = Number(formData.get("id"));
  // Importações e transações caem em cascata; o hash do arquivo some junto, então dá para reimportar.
  await db.delete(importacoes).where(eq(importacoes.contaId, id));
  await db.delete(contas).where(eq(contas.id, id));
  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
}
