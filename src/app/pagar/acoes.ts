"use server";

import { and, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { somarMeses as somarMesesData } from "@/lib/cartoes/calculo";
import { lerParcelasDigitadas, parcelasCorrigidasPelaSelic, parcelasFixas, vencimentosUltimoDiaUtil } from "@/lib/compromissos/calculo";
import {
  criarContaAvulsa,
  criarDivida,
  criarRecorrencia,
  cumprirLembrete,
  desfazerPagamento,
  marcarPago,
  type TipoDivida,
} from "@/lib/compromissos/servico";
import { hojeBrasil } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { compromissos, dividas, recorrencias } from "@/lib/db/schema";
import { normalizarTexto, parseData, parseValorCentavos } from "@/lib/importacao/util";

import type { RetornoAcao } from "@/components/formulario";

type Estado = { erro?: string; ok?: string } | null;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const dinheiro = (fd: FormData, campo: string) => parseValorCentavos(texto(fd, campo));
const inteiro = (fd: FormData, campo: string) => {
  const n = Number(texto(fd, campo));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const escopoDe = (fd: FormData) => (texto(fd, "escopo") === "PJ" ? "PJ" : "PF");
const dataDe = (fd: FormData, campo: string) => {
  const bruto = texto(fd, campo);
  return /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto : parseData(bruto);
};

function atualizarTelas() {
  revalidatePath("/pagar");
  revalidatePath("/fluxo");
  revalidatePath("/");
}

const TIPOS: NonNullable<TipoDivida>[] = ["acordo_judicial", "emprestimo", "parcelamento_imposto", "financiamento", "compra_parcelada", "outro"];

export async function novaDivida(_: Estado, fd: FormData): Promise<Estado> {
  const nome = texto(fd, "nome");
  if (!nome) return { erro: "Dê um nome para a dívida." };
  const tipo = TIPOS.find((t) => t === texto(fd, "tipo")) ?? "outro";

  let parcelas;
  if (texto(fd, "modo") === "diferentes") {
    const lido = lerParcelasDigitadas(texto(fd, "parcelasTexto"));
    if (lido.erros.length) return { erro: `Não entendi estas linhas: ${lido.erros.slice(0, 3).join(" | ")}` };
    parcelas = lido.parcelas;
  } else {
    const valor = dinheiro(fd, "valorParcela");
    const quantidade = inteiro(fd, "quantidade");
    const primeiro = dataDe(fd, "primeiroVencimento");
    if (!valor || valor <= 0 || !quantidade || !primeiro) return { erro: "Preencha valor da parcela, quantidade e 1º vencimento." };
    if (quantidade > 600) return { erro: "Quantidade de parcelas muito alta." };
    const selic = texto(fd, "modo") === "selic";
    // Parcelamentos da Receita vencem no último dia útil; a 1ª pode ter outra data (a do pedido).
    const vencimentos =
      selic || fd.get("ultimoDiaUtil") === "on"
        ? [primeiro, ...vencimentosUltimoDiaUtil(somarMesesData(primeiro, 1), quantidade - 1)]
        : null;
    if (selic) {
      const taxa = Number(texto(fd, "selicMensal").replace(",", "."));
      if (!Number.isFinite(taxa) || taxa < 0 || taxa > 5) return { erro: "Selic ao mês inválida (ex.: 1,10)." };
      parcelas = parcelasCorrigidasPelaSelic({ parcelaBasicaCentavos: valor, quantidade, vencimentos: vencimentos!, selicMensal: taxa / 100 });
    } else {
      parcelas = parcelasFixas(primeiro, quantidade, valor);
      if (vencimentos) parcelas = parcelas.map((p, i) => ({ ...p, vencimento: vencimentos[i] }));
    }
  }
  if (parcelas.length === 0) return { erro: "Informe ao menos uma parcela." };

  const jaPagas = Number(texto(fd, "jaPagas")) || 0;
  await criarDivida(obterDb(), {
    nome,
    credor: texto(fd, "credor") || null,
    tipo,
    escopo: escopoDe(fd),
    contaId: Number(texto(fd, "contaId")) || null,
    valorRecebidoCentavos: dinheiro(fd, "valorRecebido"),
    diasTolerancia: inteiro(fd, "diasTolerancia"),
    consequenciaAtraso: texto(fd, "consequencia") || null,
    lembreteAposPagar: texto(fd, "lembrete") || null,
    observacao:
      [texto(fd, "observacao"), texto(fd, "modo") === "selic" ? `Valores estimados com Selic de ${texto(fd, "selicMensal")}% ao mês + 1% no mês do pagamento.` : ""]
        .filter(Boolean)
        .join(" ") || null,
    parcelas,
    parcelasJaPagas: Math.min(Math.max(jaPagas, 0), parcelas.length),
  });
  atualizarTelas();
  return { ok: `Dívida "${nome}" cadastrada com ${parcelas.length} parcela(s).` };
}

export async function novaRecorrencia(_: Estado, fd: FormData): Promise<Estado> {
  const descricao = texto(fd, "descricao");
  const valor = dinheiro(fd, "valor");
  const dia = inteiro(fd, "dia");
  if (!descricao || !valor || !dia || dia > 31) return { erro: "Preencha descrição, valor e dia do vencimento (1 a 31)." };
  await criarRecorrencia(obterDb(), {
    descricao,
    tipo: texto(fd, "tipo") === "receber" ? "receber" : "pagar",
    escopo: escopoDe(fd),
    valorCentavos: valor,
    diaVencimento: dia,
    contaId: Number(texto(fd, "contaId")) || null,
    categoriaId: texto(fd, "categoriaId") || null,
    padraoExtrato: texto(fd, "padrao") ? normalizarTexto(texto(fd, "padrao")) : null,
    inicio: dataDe(fd, "inicio") ?? hojeBrasil().slice(0, 8) + "01",
    fim: dataDe(fd, "fim"),
  });
  atualizarTelas();
  return { ok: `Conta fixa "${descricao}" cadastrada.` };
}

export async function novaContaAvulsa(_: Estado, fd: FormData): Promise<Estado> {
  const descricao = texto(fd, "descricao");
  const valor = dinheiro(fd, "valor");
  const vencimento = dataDe(fd, "vencimento");
  if (!descricao || !valor || !vencimento) return { erro: "Preencha descrição, valor e vencimento." };
  await criarContaAvulsa(obterDb(), {
    descricao,
    tipo: texto(fd, "tipo") === "receber" ? "receber" : "pagar",
    escopo: escopoDe(fd),
    valorCentavos: valor,
    vencimento,
    contaId: Number(texto(fd, "contaId")) || null,
  });
  atualizarTelas();
  return { ok: `"${descricao}" lançada.` };
}

export async function pagar(fd: FormData): Promise<RetornoAcao> {
  await marcarPago(obterDb(), Number(fd.get("id")), dataDe(fd, "data") ?? hojeBrasil());
  atualizarTelas();
  return null;
}

export async function desfazer(fd: FormData): Promise<RetornoAcao> {
  await desfazerPagamento(obterDb(), Number(fd.get("id")));
  atualizarTelas();
  return null;
}

export async function lembreteFeito(fd: FormData): Promise<RetornoAcao> {
  await cumprirLembrete(obterDb(), Number(fd.get("id")));
  atualizarTelas();
  return null;
}

export async function excluirDivida(fd: FormData): Promise<RetornoAcao> {
  if (fd.get("confirmar") !== "on") return { erro: "Marque a caixa ao lado para confirmar a exclusão." };
  // As parcelas caem junto (cascata).
  await obterDb().delete(dividas).where(eq(dividas.id, Number(fd.get("id"))));
  atualizarTelas();
  return null;
}

/** Encerra a conta fixa: some dos próximos meses, mas o histórico do que já foi pago fica. */
export async function encerrarRecorrencia(fd: FormData): Promise<RetornoAcao> {
  const db = obterDb();
  const id = Number(fd.get("id"));
  await db.update(recorrencias).set({ ativa: false, fim: hojeBrasil() }).where(eq(recorrencias.id, id));
  await db
    .delete(compromissos)
    .where(and(eq(compromissos.recorrenciaId, id), inArray(compromissos.status, ["aberto", "vencido"]), gte(compromissos.vencimento, hojeBrasil())));
  atualizarTelas();
  return null;
}
