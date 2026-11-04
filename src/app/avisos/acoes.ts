"use server";

import { revalidatePath } from "next/cache";
import { adiarAlerta, atualizarAlertas, dispensarAlerta, marcarVistos } from "@/lib/consultor/alertas";
import type { RetornoAcao } from "@/components/formulario";
import { obterDb } from "@/lib/db";

function atualizarTelas() {
  for (const p of ["/avisos", "/", "/pf", "/pj", "/transacoes"]) revalidatePath(p);
}

export async function marcarAvisosVistos(ids: number[]) {
  await marcarVistos(obterDb(), ids.filter((n) => Number.isInteger(n)));
}

export async function adiarAviso(fd: FormData): Promise<RetornoAcao> {
  await adiarAlerta(obterDb(), Number(fd.get("id")), 7);
  atualizarTelas();
  return null;
}

export async function dispensarAviso(fd: FormData): Promise<RetornoAcao> {
  await dispensarAlerta(obterDb(), Number(fd.get("id")));
  atualizarTelas();
  return null;
}

export async function verificarAgora(): Promise<RetornoAcao> {
  const { ativos, novos } = await atualizarAlertas(obterDb());
  atualizarTelas();
  return { ok: `Verificado: ${ativos} aviso(s) ativo(s)${novos ? `, ${novos} novo(s)` : ""}.` };
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
