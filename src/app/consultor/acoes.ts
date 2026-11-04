"use server";

import { revalidatePath } from "next/cache";
import { excluirConversa } from "@/lib/consultor/chat";
import type { RetornoAcao } from "@/components/formulario";
import { obterDb } from "@/lib/db";

export async function apagarConversa(fd: FormData): Promise<RetornoAcao> {
  await excluirConversa(obterDb(), Number(fd.get("id")));
  revalidatePath("/consultor");
  return null;
}
