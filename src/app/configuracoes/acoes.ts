"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { RetornoAcao } from "@/components/formulario";
import { CHAVE_PERFIL, reaplicarIdentidade } from "@/lib/classificacao/executar";
import { atualizarAlertas } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";
import { configuracoes, regras } from "@/lib/db/schema";
import { obterPerfilFiscal, salvarPerfilFiscal } from "@/lib/fiscal/perfil";
import { parseValorCentavos } from "@/lib/importacao/util";

export async function salvarPerfil(formData: FormData): Promise<RetornoAcao> {
  const valor = String(formData.get("perfil") ?? "").slice(0, 4000);
  await obterDb()
    .insert(configuracoes)
    .values({ chave: CHAVE_PERFIL, valor })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoEm: new Date() } });
  revalidatePath("/configuracoes");
}

export async function excluirRegra(formData: FormData): Promise<RetornoAcao> {
  await obterDb().delete(regras).where(eq(regras.id, Number(formData.get("id"))));
  revalidatePath("/configuracoes");
}

const mesValido = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "");

export async function salvarDadosFiscais(formData: FormData): Promise<RetornoAcao> {
  const db = obterDb();
  const atual = await obterPerfilFiscal(db);
  const dinheiro = (campo: string) => Math.max(0, parseValorCentavos(String(formData.get(campo) ?? "")) ?? 0);
  const texto = (campo: string, max = 200) => String(formData.get(campo) ?? "").trim().slice(0, max);
  // "Foi MEI até" vira o histórico: MEI antes, Simples (ME) a partir do mês seguinte.
  const meiAte = mesValido(formData.get("meiAte"));
  let regimes = atual.regimes;
  if (formData.has("meiAte")) {
    if (meiAte) {
      const [a, m] = meiAte.split("-").map(Number);
      const inicioSimples = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7);
      regimes = [
        { regime: "mei" as const, inicio: "2000-01" },
        { regime: "simples" as const, inicio: inicioSimples },
      ];
    } else regimes = [];
  }
  const identidadeAntes = JSON.stringify([atual.nomeSocio, atual.cpfSocio, atual.nomesEmpresa]);
  const novo = {
    ...atual,
    proLaboreMensalCentavos: dinheiro("proLabore"),
    custoFixoPjCentavos: dinheiro("custoFixo"),
    sujeitoFatorR: formData.get("sujeitoFatorR") === "on",
    emailResumo: texto("emailResumo"),
    nomeSocio: texto("nomeSocio", 120),
    cpfSocio: texto("cpfSocio", 20).replace(/\D/g, "").slice(0, 11),
    nomesEmpresa: texto("nomesEmpresa", 500)
      .split(/[;\n]/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 8),
    regimes,
    proLaboreDesde: mesValido(formData.get("proLaboreDesde")),
  };
  await salvarPerfilFiscal(db, novo);
  // Seu nome/CPF ou o da empresa mudaram: procura retiradas e aportes nas transações que já existem.
  let reconhecidas = 0;
  if (JSON.stringify([novo.nomeSocio, novo.cpfSocio, novo.nomesEmpresa]) !== identidadeAntes) {
    reconhecidas = await reaplicarIdentidade(db);
    await atualizarAlertas(db, { atualizarCompromissos: false }).catch(() => undefined);
  }
  for (const p of ["/configuracoes", "/impostos", "/", "/pf", "/pj", "/transacoes"]) revalidatePath(p);
  return { ok: reconhecidas ? `Salvo. ${reconhecidas} transação(ões) reconhecida(s) como retirada, aporte ou transferência.` : "Salvo." };
}

export async function procurarRetiradas(): Promise<{ ok: string }> {
  const db = obterDb();
  const n = await reaplicarIdentidade(db);
  await atualizarAlertas(db, { atualizarCompromissos: false }).catch(() => undefined);
  for (const p of ["/", "/pf", "/pj", "/transacoes"]) revalidatePath(p);
  return { ok: n ? `${n} transação(ões) reconhecida(s) como retirada, aporte ou transferência entre contas suas.` : "Nada novo encontrado." };
}
