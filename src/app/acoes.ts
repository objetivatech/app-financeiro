"use server";

import { revalidatePath } from "next/cache";
import { periodoDoMes } from "@/lib/consultas";
import { obterDb } from "@/lib/db";
import { gerarAnalise } from "@/lib/ia/analise";
import { ErroIa } from "@/lib/ia/cliente";

export async function gerarAnaliseDoMes(_estado: { erro?: string } | null, formData: FormData) {
  const mes = String(formData.get("mes") ?? "");
  if (!/^\d{4}-\d{2}$/.test(mes)) return { erro: "Mês inválido." };
  try {
    await gerarAnalise(obterDb(), periodoDoMes(mes));
  } catch (erro) {
    if (erro instanceof ErroIa) return { erro: erro.message };
    console.error("Falha ao gerar análise", erro);
    return { erro: "Não foi possível gerar a análise agora." };
  }
  revalidatePath("/");
  return null;
}
