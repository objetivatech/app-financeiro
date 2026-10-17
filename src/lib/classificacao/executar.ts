import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { Db } from "../db";
import { configuracoes, transacoes, type Transacao } from "../db/schema";
import { iaDisponivel } from "../ia/cliente";
import { classificarComIa } from "./ia";
import {
  aplicar,
  aplicarEscopoDaConta,
  aplicarHeuristicas,
  aplicarRegras,
  marcarMistura,
  parearTransferencias,
  type ContaContexto,
  type TransacaoClassificavel,
} from "./motor";

export const CHAVE_PERFIL = "perfil_usuario";

export async function obterPerfil(db: Db): Promise<string> {
  const linha = await db.query.configuracoes.findFirst({ where: eq(configuracoes.chave, CHAVE_PERFIL) });
  return typeof linha?.valor === "string" ? linha.valor : "";
}

function paraClassificavel(t: Transacao): TransacaoClassificavel {
  return {
    id: t.id,
    contaId: t.contaId,
    data: t.data,
    descricaoNormalizada: t.descricaoNormalizada,
    valorCentavos: t.valorCentavos,
    documentoContraparte: t.documentoContraparte,
    escopo: t.escopo,
    categoriaId: t.categoriaId,
    natureza: t.natureza,
    classificadoPor: t.classificadoPor,
    parTransferenciaId: t.parTransferenciaId,
    revisar: t.revisar,
    motivo: t.motivo,
    confianca: t.confianca,
  };
}

function mudou(a: TransacaoClassificavel, b: TransacaoClassificavel): boolean {
  return (
    a.escopo !== b.escopo ||
    a.categoriaId !== b.categoriaId ||
    a.natureza !== b.natureza ||
    a.classificadoPor !== b.classificadoPor ||
    a.parTransferenciaId !== b.parTransferenciaId ||
    a.revisar !== b.revisar ||
    a.motivo !== b.motivo ||
    a.confianca !== b.confianca
  );
}

export interface ResumoClassificacao {
  processadas: number;
  porIa: number;
  transferencias: number;
  paraRevisar: number;
  erroIa?: string;
}

/**
 * Classifica as transações ainda sem categoria: regras do usuário, heurísticas,
 * pareamento de transferências entre contas próprias e, por último, IA.
 */
export async function classificarPendentes(db: Db, opcoes: { usarIa?: boolean } = {}): Promise<ResumoClassificacao> {
  const pendentesDb = await db.query.transacoes.findMany({
    where: or(isNull(transacoes.classificadoPor), isNull(transacoes.categoriaId)),
  });
  const resumo: ResumoClassificacao = { processadas: 0, porIa: 0, transferencias: 0, paraRevisar: 0 };
  if (pendentesDb.length === 0) return resumo;

  const [listaContas, listaRegras, listaTitulares, perfil] = await Promise.all([
    db.query.contas.findMany(),
    db.query.regras.findMany(),
    db.query.titulares.findMany(),
    obterPerfil(db),
  ]);
  const mapaContas = new Map<number, ContaContexto & { apelido: string }>(
    listaContas.map((c) => [c.id, { id: c.id, tipo: c.tipo, escopoPadrao: c.escopoPadrao, apelido: c.apelido }]),
  );
  const documentos = new Set(listaTitulares.map((t) => t.documento).filter((d): d is string => Boolean(d)));

  // Candidatas a "outra perna" de transferência: transações sem par na mesma janela de datas.
  const datas = pendentesDb.map((t) => t.data).sort();
  const inicio = new Date(Date.parse(datas[0]) - 3 * 86_400_000).toISOString().slice(0, 10);
  const fim = new Date(Date.parse(datas[datas.length - 1]) + 3 * 86_400_000).toISOString().slice(0, 10);
  const vizinhasDb = await db.query.transacoes.findMany({
    where: and(isNull(transacoes.parTransferenciaId), gte(transacoes.data, inicio), lte(transacoes.data, fim)),
  });

  const porId = new Map<number, TransacaoClassificavel>();
  const originais = new Map<number, TransacaoClassificavel>();
  for (const t of [...pendentesDb, ...vizinhasDb]) {
    if (porId.has(t.id)) continue;
    porId.set(t.id, paraClassificavel(t));
    originais.set(t.id, paraClassificavel(t));
  }
  const pendentes = pendentesDb.map((t) => porId.get(t.id)!);
  const dbPorId = new Map([...pendentesDb, ...vizinhasDb].map((t) => [t.id, t]));

  const regrasCtx = listaRegras.map((r) => ({
    padrao: r.padrao,
    contaId: r.contaId,
    escopo: r.escopo,
    categoriaId: r.categoriaId,
    natureza: r.natureza,
  }));

  for (const t of pendentes) {
    const conta = mapaContas.get(t.contaId)!;
    aplicarEscopoDaConta(t, conta);
    aplicarHeuristicas(t, conta);
    aplicarRegras(t, regrasCtx);
  }
  resumo.transferencias = parearTransferencias([...porId.values()], mapaContas, documentos);

  const semCategoria = pendentes.filter((t) => !t.categoriaId);
  if (semCategoria.length > 0 && opcoes.usarIa !== false && iaDisponivel()) {
    try {
      const resultado = await classificarComIa(
        semCategoria.map((t) => {
          const original = dbPorId.get(t.id)!;
          const conta = mapaContas.get(t.contaId)!;
          return {
            id: t.id,
            data: t.data,
            descricao: original.descricao,
            valorCentavos: t.valorCentavos,
            nomeContraparte: original.nomeContraparte,
            conta: { apelido: conta.apelido, tipo: conta.tipo, escopoPadrao: conta.escopoPadrao },
          };
        }),
        perfil,
      );
      for (const c of resultado) {
        const t = porId.get(c.id);
        if (!t) continue;
        const confianca = Math.max(0, Math.min(1, c.confianca));
        // A IA decide o escopo pela natureza do gasto; se divergir da conta, marcarMistura sinaliza abaixo.
        aplicar(t, "ia", { categoriaId: c.categoria_id, escopo: c.escopo, motivo: c.motivo, confianca, revisar: confianca < 0.6 });
        resumo.porIa++;
      }
    } catch (erro) {
      resumo.erroIa = erro instanceof Error ? erro.message : String(erro);
    }
  }

  for (const t of pendentes) marcarMistura(t, mapaContas.get(t.contaId)!);

  const alteradas = [...porId.values()].filter((t) => mudou(t, originais.get(t.id)!));
  for (const t of alteradas) {
    await db
      .update(transacoes)
      .set({
        escopo: t.escopo,
        categoriaId: t.categoriaId,
        natureza: t.natureza,
        classificadoPor: t.classificadoPor,
        parTransferenciaId: t.parTransferenciaId,
        revisar: t.revisar,
        motivo: t.motivo,
        confianca: t.confianca,
      })
      .where(eq(transacoes.id, t.id));
  }
  resumo.processadas = pendentes.length;
  resumo.paraRevisar = [...porId.values()].filter((t) => t.revisar).length;
  return resumo;
}

/**
 * Usado ao mudar o escopo ou o tipo de uma conta: reabre a classificação automática das transações dela
 * (inclusive as transferências, cuja natureza depende do escopo das duas contas). O que o usuário
 * definiu à mão e o que veio de regra é preservado.
 */
export async function reabrirClassificacaoDaConta(db: Db, contaId: number): Promise<void> {
  const automatica = or(
    isNull(transacoes.classificadoPor),
    inArray(transacoes.classificadoPor, ["conta", "ia", "heuristica", "transferencia"]),
  );
  const daConta = await db
    .select({ id: transacoes.id, par: transacoes.parTransferenciaId })
    .from(transacoes)
    .where(and(eq(transacoes.contaId, contaId), automatica));
  const ids = daConta.map((t) => t.id);
  const pares = daConta.map((t) => t.par).filter((p): p is number => p !== null);
  if (ids.length === 0) return;
  const limpar = {
    classificadoPor: null,
    categoriaId: null,
    escopo: null,
    natureza: "comum" as const,
    revisar: false,
    motivo: null,
    confianca: null,
    parTransferenciaId: null,
  };
  await db.update(transacoes).set(limpar).where(inArray(transacoes.id, ids));
  if (pares.length > 0) {
    // A outra perna da transferência também precisa ser refeita (se não foi definida à mão).
    await db.update(transacoes).set(limpar).where(and(inArray(transacoes.id, pares), automatica));
  }
}
