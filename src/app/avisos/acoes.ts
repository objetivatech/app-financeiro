"use server";

import { revalidatePath } from "next/cache";
import { adiarAlerta, atualizarAlertas, dispensarAlerta, marcarVistos } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";

function atualizarTelas() {
  for (const p of ["/avisos", "/", "/pf", "/pj", "/transacoes"]) revalidatePath(p);
}

export async function marcarAvisosVistos(ids: number[]) {
  await marcarVistos(obterDb(), ids.filter((n) => Number.isInteger(n)));
}

export async function adiarAviso(fd: FormData) {
  await adiarAlerta(obterDb(), Number(fd.get("id")), 7);
  atualizarTelas();
}

export async function dispensarAviso(fd: FormData) {
  await dispensarAlerta(obterDb(), Number(fd.get("id")));
  atualizarTelas();
}

export async function verificarAgora() {
  await atualizarAlertas(obterDb());
  atualizarTelas();
}

export async function gerarCartaAgora(): Promise<{ erro?: string; ok?: string }> {
  try {
    const { gerarCartaSemanal } = await import("@/lib/consultor/carta");
    await gerarCartaSemanal(obterDb());
    atualizarTelas();
    return { ok: "Carta gerada." };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Não foi possível gerar a carta." };
  }
}
