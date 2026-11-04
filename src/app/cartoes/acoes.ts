"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { excluirFatura, registrarFatura } from "@/lib/cartoes/servico";
import { classificarPendentes, reabrirClassificacaoDaConta } from "@/lib/classificacao/executar";
import { atualizarCompromissos } from "@/lib/compromissos/servico";
import { obterDb } from "@/lib/db";
import { contas } from "@/lib/db/schema";
import { obterInstituicao } from "@/lib/instituicoes/catalogo";
import { parseData, parseValorCentavos } from "@/lib/importacao/util";

type Estado = { erro?: string; ok?: string } | null;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const dia = (fd: FormData, campo: string) => {
  const n = Number(texto(fd, campo));
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};
const dataDe = (fd: FormData, campo: string) => {
  const bruto = texto(fd, campo);
  return /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : parseData(bruto);
};
const ESCOPOS = ["PF", "PJ", "misto"] as const;

function atualizarTelas() {
  for (const p of ["/cartoes", "/fluxo", "/pagar", "/", "/pf", "/pj", "/contas"]) revalidatePath(p);
}

/** Cria um cartão novo ou atualiza os dados de um existente (fechamento, vencimento, limite...). */
export async function salvarCartao(_: Estado, fd: FormData): Promise<Estado> {
  const db = obterDb();
  const id = Number(texto(fd, "id")) || null;
  const apelido = texto(fd, "apelido").slice(0, 80);
  if (!apelido) return { erro: "Dê um nome ao cartão." };
  const escopo = ESCOPOS.find((e) => e === texto(fd, "escopo")) ?? "misto";
  const limite = texto(fd, "limite") ? parseValorCentavos(texto(fd, "limite")) : null;
  const contaPagamentoId = Number(texto(fd, "contaPagamentoId")) || null;
  const finalCartao = texto(fd, "finalCartao").replace(/\D/g, "").slice(-4) || null;
  const dados = {
    apelido,
    escopoPadrao: escopo,
    finalCartao,
    diaFechamento: dia(fd, "diaFechamento"),
    diaVencimento: dia(fd, "diaVencimento"),
    limiteCentavos: limite,
    contaPagamentoId: contaPagamentoId === id ? null : contaPagamentoId,
  };
  if (id) {
    const atual = await db.query.contas.findFirst({ where: eq(contas.id, id) });
    if (!atual) return { erro: "Cartão não encontrado." };
    await db.update(contas).set(dados).where(eq(contas.id, id));
    if (atual.escopoPadrao !== escopo) {
      await reabrirClassificacaoDaConta(db, id);
      await classificarPendentes(db);
    }
  } else {
    const instituicao = obterInstituicao(texto(fd, "instituicaoId") || undefined);
    await db.insert(contas).values({
      ...dados,
      tipo: "cartao_credito",
      instituicaoId: instituicao?.id ?? null,
      instituicaoNome: instituicao?.nome ?? (texto(fd, "instituicaoNome") || apelido),
    });
  }
  atualizarTelas();
  return { ok: id ? "Cartão atualizado." : "Cartão cadastrado. Agora envie a fatura mais recente." };
}

/** Lança a fatura à mão (sem o PDF): vencimento e total a pagar. */
export async function lancarFatura(_: Estado, fd: FormData): Promise<Estado> {
  const db = obterDb();
  const contaId = Number(texto(fd, "contaId"));
  const vencimento = dataDe(fd, "vencimento");
  const valor = parseValorCentavos(texto(fd, "valor"));
  if (!contaId || !vencimento) return { erro: "Informe o cartão e o vencimento." };
  if (valor === null || valor < 0) return { erro: "Informe o total da fatura." };
  const minimo = texto(fd, "minimo") ? parseValorCentavos(texto(fd, "minimo")) : null;
  await registrarFatura(db, { contaId, vencimento, fechamento: dataDe(fd, "fechamento"), valorCentavos: Math.abs(valor), minimoCentavos: minimo, origem: "manual" });
  await atualizarCompromissos(db);
  atualizarTelas();
  return { ok: "Fatura lançada: já aparece em A pagar e no fluxo de caixa." };
}

export async function removerFatura(fd: FormData) {
  await excluirFatura(obterDb(), Number(fd.get("id")));
  atualizarTelas();
}
