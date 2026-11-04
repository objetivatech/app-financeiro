"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { RetornoAcao } from "@/components/formulario";
import { reabrirClassificacaoDaConta, reclassificarEmSegundoPlano } from "@/lib/classificacao/executar";
import { atualizarAlertas } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";
import { contas, importacoes } from "@/lib/db/schema";

const ESCOPOS = ["PF", "PJ", "misto"] as const;
const TIPOS = ["corrente", "pagamento", "poupanca", "cartao_credito", "investimento"] as const;

export async function salvarConta(formData: FormData): Promise<RetornoAcao> {
  const db = obterDb();
  const id = Number(formData.get("id"));
  const atual = await db.query.contas.findFirst({ where: eq(contas.id, id) });
  if (!atual) return { erro: "Conta não encontrada (talvez tenha sido excluída). Recarregue a página." };

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

  // Mudou de quem é a conta (ou o tipo): refaz a classificação automática dela, em segundo plano
  // (com a IA pode levar minutos; o clique em Salvar não espera).
  const reclassificar = escopo !== atual.escopoPadrao || tipo !== atual.tipo;
  if (reclassificar) {
    await reabrirClassificacaoDaConta(db, id);
    reclassificarEmSegundoPlano(db, () => atualizarAlertas(db, { atualizarCompromissos: false }));
  }
  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
  return { ok: reclassificar ? "Salvo. As transações desta conta estão sendo reclassificadas em segundo plano." : "Salvo." };
}

export async function excluirConta(formData: FormData): Promise<RetornoAcao> {
  if (formData.get("confirmar") !== "on") return { erro: "Marque a caixa ao lado para confirmar a exclusão." };
  const db = obterDb();
  const id = Number(formData.get("id"));
  // Importações e transações caem em cascata; o hash do arquivo some junto, então dá para reimportar.
  await db.delete(importacoes).where(eq(importacoes.contaId, id));
  await db.delete(contas).where(eq(contas.id, id));
  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
  return { ok: "Conta excluída." };
}
