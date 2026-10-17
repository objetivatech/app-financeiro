"use server";

import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import { classificarPendentes } from "@/lib/classificacao/executar";
import { obterDb } from "@/lib/db";
import { NATUREZAS, regras, transacoes, type Natureza } from "@/lib/db/schema";
import { normalizarTexto } from "@/lib/importacao/util";

const categoriasValidas = new Set(CATEGORIAS_PADRAO.map((c) => c.id));

function lerEscopo(v: FormDataEntryValue | null): "PF" | "PJ" | null {
  return v === "PF" || v === "PJ" ? v : null;
}

function lerNatureza(v: FormDataEntryValue | null): Natureza {
  return NATUREZAS.includes(v as Natureza) ? (v as Natureza) : "comum";
}

/** O usuário corrige uma transação; opcionalmente vira regra para as parecidas. */
export async function salvarClassificacao(formData: FormData) {
  const db = obterDb();
  const id = Number(formData.get("id"));
  const escopo = lerEscopo(formData.get("escopo"));
  const categoria = String(formData.get("categoriaId") ?? "");
  const categoriaId = categoriasValidas.has(categoria) ? categoria : null;
  const natureza = lerNatureza(formData.get("natureza"));

  const [atual] = await db
    .update(transacoes)
    .set({ escopo, categoriaId, natureza, classificadoPor: "usuario", revisar: false, motivo: "Definido por você", confianca: 1 })
    .where(eq(transacoes.id, id))
    .returning();
  if (!atual) return;

  // Numa transferência entre contas próprias, a natureza vale para as duas pernas.
  if (atual.parTransferenciaId) {
    await db
      .update(transacoes)
      .set({ natureza, categoriaId, revisar: false, classificadoPor: "usuario", motivo: "Definido por você (outra perna da transferência)" })
      .where(eq(transacoes.id, atual.parTransferenciaId));
  }

  if (formData.get("criarRegra") === "on") {
    const padrao = normalizarTexto(String(formData.get("padrao") ?? ""));
    if (padrao.length >= 3) {
      const soNestaConta = formData.get("regraSoNestaConta") === "on";
      await db.insert(regras).values({
        padrao,
        contaId: soNestaConta ? atual.contaId : null,
        escopo,
        categoriaId,
        natureza: natureza === "comum" ? null : natureza,
      });
      // Reabre as parecidas que não foram definidas manualmente, para a regra valer nelas também.
      await db
        .update(transacoes)
        .set({ classificadoPor: null, categoriaId: null, revisar: false })
        .where(
          and(
            sql`${transacoes.descricaoNormalizada} like ${"%" + padrao.replace(/[%_]/g, "\\$&") + "%"}`,
            or(isNull(transacoes.classificadoPor), ne(transacoes.classificadoPor, "usuario")),
            soNestaConta ? eq(transacoes.contaId, atual.contaId) : undefined,
          ),
        );
      await classificarPendentes(db, { usarIa: false });
    }
  }
  revalidatePath("/transacoes");
  revalidatePath("/");
}

export async function marcarRevisada(formData: FormData) {
  const db = obterDb();
  await db.update(transacoes).set({ revisar: false }).where(eq(transacoes.id, Number(formData.get("id"))));
  revalidatePath("/transacoes");
  revalidatePath("/");
}

export async function reclassificarComIa() {
  const db = obterDb();
  await classificarPendentes(db);
  revalidatePath("/transacoes");
  revalidatePath("/");
}
