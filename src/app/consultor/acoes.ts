"use server";

import { revalidatePath } from "next/cache";
import { excluirConversa } from "@/lib/consultor/chat";
import { obterDb } from "@/lib/db";

export async function apagarConversa(fd: FormData) {
  await excluirConversa(obterDb(), Number(fd.get("id")));
  revalidatePath("/consultor");
}
