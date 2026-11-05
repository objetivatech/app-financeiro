"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { alternarVinculado, excluirFatura, excluirVinculado, marcarFaturaPaga, registrarFatura, salvarVinculado } from "@/lib/cartoes/servico";
import { hojeBrasil } from "@/lib/datas";
import { atualizarAlertas } from "@/lib/consultor/alertas";
import type { RetornoAcao } from "@/components/formulario";
import { reabrirClassificacaoDaConta, reclassificarEmSegundoPlano } from "@/lib/classificacao/executar";
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
      reclassificarEmSegundoPlano(db, () => atualizarAlertas(db, { atualizarCompromissos: false }));
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

export async function removerFatura(fd: FormData): Promise<RetornoAcao> {
  await excluirFatura(obterDb(), Number(fd.get("id")));
  atualizarTelas();
  return { ok: "Fatura excluída." };
}

/** Marca a fatura como paga (pagamento que não está em nenhum extrato) ou desfaz. */
export async function marcarFatura(fd: FormData): Promise<RetornoAcao> {
  const db = obterDb();
  await marcarFaturaPaga(db, Number(fd.get("id")), fd.get("paga") === "1" ? hojeBrasil() : null);
  await atualizarAlertas(db, { atualizarCompromissos: false }).catch(() => undefined);
  atualizarTelas();
  return null;
}

/** Cadastra (ou renomeia) um cartão virtual ou adicional de um cartão. */
export async function novoVinculado(fd: FormData): Promise<RetornoAcao> {
  const contaId = Number(fd.get("contaId"));
  const final = String(fd.get("final") ?? "").replace(/\D/g, "").slice(-4);
  if (!contaId) return { erro: "Cartão não encontrado. Recarregue a página." };
  if (final.length < 4) return { erro: "Informe os 4 últimos dígitos do cartão virtual ou adicional." };
  const tipo = fd.get("tipo") === "adicional" ? "adicional" : "virtual";
  const apelido = String(fd.get("apelido") ?? "").trim().slice(0, 60) || `${tipo === "virtual" ? "Virtual" : "Adicional"} final ${final}`;
  await salvarVinculado(obterDb(), { contaId, final, tipo, apelido });
  atualizarTelas();
  return { ok: `${apelido} cadastrado.` };
}

export async function alternarCartaoVinculado(fd: FormData): Promise<RetornoAcao> {
  const db = obterDb();
  await alternarVinculado(db, Number(fd.get("id")), fd.get("ativo") === "1");
  // Cancelar um virtual pode deixar assinaturas sem cartão: o consultor confere.
  await atualizarAlertas(db, { atualizarCompromissos: false }).catch(() => undefined);
  atualizarTelas();
  return null;
}

export async function removerCartaoVinculado(fd: FormData): Promise<RetornoAcao> {
  await excluirVinculado(obterDb(), Number(fd.get("id")));
  atualizarTelas();
  return null;
}
