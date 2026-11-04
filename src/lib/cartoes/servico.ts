import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { hojeBrasil, somarDias } from "../datas";
import type { Db } from "../db";
import { cartoesVinculados, compromissos, contas, faturas, importacoes, transacoes, type Conta } from "../db/schema";
import { faturaDaCompra, parcelasFuturas, proximoVencimento, somarMeses, totalPorMes, type ParcelaFutura, type ParcelaLancada } from "./calculo";

/** Escopo usado para o pagamento do cartão: cartão misto conta como pessoal (está no seu nome). */
export function escopoDoCartao(c: Pick<Conta, "escopoPadrao">): "PF" | "PJ" {
  return c.escopoPadrao === "PJ" ? "PJ" : "PF";
}

export interface NovaFatura {
  contaId: number;
  vencimento: string;
  fechamento?: string | null;
  valorCentavos: number;
  minimoCentavos?: number | null;
  importacaoId?: number | null;
  origem: "importacao" | "manual";
}

/**
 * Registra (ou atualiza) a fatura do cartão e a conta a pagar dela. A conta a pagar fica na conta
 * que paga o cartão, para ser quitada quando o pagamento aparecer no extrato.
 */
export async function registrarFatura(db: Db, f: NovaFatura): Promise<void> {
  const cartao = await db.query.contas.findFirst({ where: eq(contas.id, f.contaId) });
  if (!cartao) throw new Error("Cartão não encontrado.");
  const hoje = hojeBrasil();
  const idExterno = `${f.contaId}:${f.vencimento}`;
  let compromissoId: number | null = null;
  if (f.valorCentavos > 0) {
    const valores = {
      tipo: "pagar" as const,
      escopo: escopoDoCartao(cartao),
      descricao: `Fatura ${cartao.apelido}`,
      valorCentavos: f.valorCentavos,
      vencimento: f.vencimento,
      categoriaId: "mov_fatura",
      contaId: cartao.contaPagamentoId ?? null,
      origem: "fatura",
      idExterno,
    };
    const existente = await db.query.compromissos.findFirst({ where: and(eq(compromissos.origem, "fatura"), eq(compromissos.idExterno, idExterno)) });
    if (existente) {
      // Não reabre uma fatura já paga: só corrige valor e dados.
      await db.update(compromissos).set({ ...valores, atualizadoEm: new Date() }).where(eq(compromissos.id, existente.id));
      compromissoId = existente.id;
    } else {
      const [novo] = await db
        .insert(compromissos)
        .values({ ...valores, status: f.vencimento < hoje ? "vencido" : "aberto" })
        .returning({ id: compromissos.id });
      compromissoId = novo.id;
    }
  }
  const dados = {
    contaId: f.contaId,
    vencimento: f.vencimento,
    fechamento: f.fechamento ?? null,
    valorCentavos: f.valorCentavos,
    minimoCentavos: f.minimoCentavos ?? null,
    importacaoId: f.importacaoId ?? null,
    compromissoId,
    origem: f.origem,
  };
  await db
    .insert(faturas)
    .values(dados)
    .onConflictDoUpdate({
      target: [faturas.contaId, faturas.vencimento],
      // Fatura importada de novo mantém o vínculo com a importação mais recente.
      set: { ...dados, importacaoId: f.importacaoId ?? sql`${faturas.importacaoId}` },
    });
}

export async function excluirFatura(db: Db, id: number): Promise<void> {
  const f = await db.query.faturas.findFirst({ where: eq(faturas.id, id) });
  if (!f) return;
  await db.delete(faturas).where(eq(faturas.id, id));
  if (f.compromissoId) await db.delete(compromissos).where(and(eq(compromissos.id, f.compromissoId), eq(compromissos.status, "aberto")));
}

/** Parcelas de compras parceladas já lançadas nos cartões, com o vencimento da fatura em que caíram. */
async function parcelasLancadas(db: Db, cartoes: Conta[]): Promise<ParcelaLancada[]> {
  if (cartoes.length === 0) return [];
  const linhas = await db
    .select({
      contaId: transacoes.contaId,
      data: transacoes.data,
      descricao: transacoes.descricao,
      descricaoNormalizada: transacoes.descricaoNormalizada,
      valorCentavos: transacoes.valorCentavos,
      parcelaAtual: transacoes.parcelaAtual,
      parcelaTotal: transacoes.parcelaTotal,
      vencimentoFatura: faturas.vencimento,
      periodoFim: importacoes.periodoFim,
    })
    .from(transacoes)
    .leftJoin(faturas, eq(faturas.importacaoId, transacoes.importacaoId))
    .leftJoin(importacoes, eq(importacoes.id, transacoes.importacaoId))
    .where(
      and(
        inArray(transacoes.contaId, cartoes.map((c) => c.id)),
        isNotNull(transacoes.parcelaAtual),
        sql`${transacoes.parcelaTotal} > ${transacoes.parcelaAtual}`,
        // Compras de até 2 anos atrás bastam (parcelamentos longos raramente passam de 24x).
        gte(transacoes.data, somarDias(hojeBrasil(), -730)),
      ),
    );
  const porId = new Map(cartoes.map((c) => [c.id, c]));
  const resultado: ParcelaLancada[] = [];
  for (const l of linhas) {
    const cartao = porId.get(l.contaId)!;
    let vencimento = l.vencimentoFatura;
    // Sem a fatura (ex.: OFX sem vencimento), estima pelo dia de vencimento do cartão.
    if (!vencimento && cartao.diaVencimento) {
      if (l.periodoFim) vencimento = proximoVencimento(l.periodoFim, cartao.diaVencimento);
      else if (cartao.diaFechamento) {
        // A data na fatura costuma ser a da compra original: a parcela N cai N-1 meses depois.
        vencimento = somarMeses(faturaDaCompra(l.data, cartao.diaFechamento, cartao.diaVencimento).vencimento, l.parcelaAtual! - 1, cartao.diaVencimento);
      }
    }
    if (!vencimento) continue;
    resultado.push({
      contaId: l.contaId,
      descricao: l.descricao,
      descricaoNormalizada: l.descricaoNormalizada,
      valorCentavos: Number(l.valorCentavos),
      parcelaAtual: l.parcelaAtual!,
      parcelaTotal: l.parcelaTotal!,
      vencimentoFatura: vencimento,
    });
  }
  return resultado;
}

export interface VinculadoResumo {
  id: number;
  tipo: "virtual" | "adicional";
  apelido: string;
  final: string;
  ativo: boolean;
  canceladoEm: string | null;
  /** Compras nos últimos 90 dias com este final. */
  compras90d: number;
  total90dCentavos: number;
}

export interface ResumoCartao {
  conta: Conta;
  vinculados: VinculadoResumo[];
  contaPagamentoApelido: string | null;
  faturas: { id: number; vencimento: string; fechamento: string | null; valorCentavos: number; minimoCentavos: number | null; origem: string; status: string | null }[];
  /** Próxima fatura ainda não paga (conhecida). */
  faturaAberta: { vencimento: string; valorCentavos: number; status: string } | null;
  parcelas: ParcelaFutura[];
  /** Total das parcelas que ainda vão cair (compromete o limite). */
  parceladoAVencerCentavos: number;
  /** Estimativa do limite usado: fatura em aberto + parcelas futuras. */
  limiteUsadoCentavos: number;
  /** Média mensal de compras à vista (sem parcelamento) nos últimos 3 meses. */
  mediaAVistaCentavos: number;
  /** Juros, IOF, multa, anuidade e rotativo nos últimos 3 meses. */
  encargos3mCentavos: number;
  /** Projeção dos próximos meses: fatura conhecida ou parcelas já contratadas. */
  projecao: { mes: string; valorCentavos: number; conhecida: boolean }[];
}

const ENCARGOS = /\b(JUROS|IOF|MULTA|ENCARGOS?|ANUIDADE|ROTATIVO|MORA|TARIFA)\b/;

/** Situação dos cartões: faturas, parcelas futuras, limite e encargos. */
export async function resumoCartoes(db: Db, mesesProjecao = 6): Promise<ResumoCartao[]> {
  const hoje = hojeBrasil();
  const cartoes = await db.query.contas.findMany({ where: eq(contas.tipo, "cartao_credito"), orderBy: [asc(contas.apelido)] });
  if (cartoes.length === 0) return [];
  const ids = cartoes.map((c) => c.id);
  const [listaFaturas, lancadas, pagadoras, aVista, encargos, vinculados, porFinal] = await Promise.all([
    db
      .select({
        id: faturas.id,
        contaId: faturas.contaId,
        vencimento: faturas.vencimento,
        fechamento: faturas.fechamento,
        valorCentavos: faturas.valorCentavos,
        minimoCentavos: faturas.minimoCentavos,
        origem: faturas.origem,
        status: compromissos.status,
      })
      .from(faturas)
      .leftJoin(compromissos, eq(compromissos.id, faturas.compromissoId))
      .where(inArray(faturas.contaId, ids))
      .orderBy(desc(faturas.vencimento)),
    parcelasLancadas(db, cartoes),
    db.query.contas.findMany({ columns: { id: true, apelido: true } }),
    db
      .select({ contaId: transacoes.contaId, total: sql<number>`coalesce(-sum(${transacoes.valorCentavos}), 0)::bigint` })
      .from(transacoes)
      .where(
        and(
          inArray(transacoes.contaId, ids),
          lt(transacoes.valorCentavos, 0),
          sql`(${transacoes.parcelaTotal} is null or ${transacoes.parcelaTotal} <= 1)`,
          sql`${transacoes.natureza} not in ('pagamento_fatura','transferencia_interna')`,
          gte(transacoes.data, somarDias(hoje, -90)),
        ),
      )
      .groupBy(transacoes.contaId),
    db
      .select({ contaId: transacoes.contaId, descricao: transacoes.descricaoNormalizada, valor: transacoes.valorCentavos })
      .from(transacoes)
      .where(and(inArray(transacoes.contaId, ids), lt(transacoes.valorCentavos, 0), gte(transacoes.data, somarDias(hoje, -90)))),
    db.select().from(cartoesVinculados).where(inArray(cartoesVinculados.contaId, ids)).orderBy(asc(cartoesVinculados.final)),
    db
      .select({
        contaId: transacoes.contaId,
        final: transacoes.finalCartao,
        qtd: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(-sum(${transacoes.valorCentavos}), 0)::bigint`,
      })
      .from(transacoes)
      .where(and(inArray(transacoes.contaId, ids), lt(transacoes.valorCentavos, 0), isNotNull(transacoes.finalCartao), gte(transacoes.data, somarDias(hoje, -90))))
      .groupBy(transacoes.contaId, transacoes.finalCartao),
  ]);
  const apelidos = new Map(pagadoras.map((c) => [c.id, c.apelido]));
  const todasFuturas = parcelasFuturas(lancadas, hoje);

  return cartoes.map((c) => {
    const fs = listaFaturas.filter((f) => f.contaId === c.id).map((f) => ({ ...f, valorCentavos: Number(f.valorCentavos), minimoCentavos: f.minimoCentavos === null ? null : Number(f.minimoCentavos) }));
    const aberta = [...fs].reverse().find((f) => f.status === "aberto" || f.status === "vencido") ?? null;
    const parcelas = todasFuturas.filter((p) => p.contaId === c.id);
    const parcelado = parcelas.reduce((s, p) => s + p.valorCentavos, 0);
    // Parcelas que já estão dentro da fatura em aberto não contam duas vezes.
    const parceladoForaDaAberta = parcelas.filter((p) => !aberta || p.vencimento.slice(0, 7) !== aberta.vencimento.slice(0, 7)).reduce((s, p) => s + p.valorCentavos, 0);
    const porMes = totalPorMes(parcelas);
    const projecao: ResumoCartao["projecao"] = [];
    for (let i = 0; i < mesesProjecao; i++) {
      const mes = somarMeses(`${hoje.slice(0, 7)}-01`, i).slice(0, 7);
      const conhecida = fs.find((f) => f.vencimento.slice(0, 7) === mes && f.status !== "pago");
      if (conhecida) projecao.push({ mes, valorCentavos: conhecida.valorCentavos, conhecida: true });
      else if (!fs.some((f) => f.vencimento.slice(0, 7) === mes && f.status === "pago")) {
        projecao.push({ mes, valorCentavos: porMes.get(mes) ?? 0, conhecida: false });
      }
    }
    return {
      conta: c,
      vinculados: vinculados
        .filter((v) => v.contaId === c.id)
        .map((v) => {
          const uso = porFinal.find((p) => p.contaId === c.id && p.final === v.final);
          return { id: v.id, tipo: v.tipo, apelido: v.apelido, final: v.final, ativo: v.ativo, canceladoEm: v.canceladoEm, compras90d: uso?.qtd ?? 0, total90dCentavos: Number(uso?.total ?? 0) };
        }),
      contaPagamentoApelido: c.contaPagamentoId ? (apelidos.get(c.contaPagamentoId) ?? null) : null,
      faturas: fs.slice(0, 12),
      faturaAberta: aberta ? { vencimento: aberta.vencimento, valorCentavos: aberta.valorCentavos, status: aberta.status! } : null,
      parcelas,
      parceladoAVencerCentavos: parcelado,
      limiteUsadoCentavos: (aberta?.valorCentavos ?? 0) + parceladoForaDaAberta,
      mediaAVistaCentavos: Math.round(Number(aVista.find((a) => a.contaId === c.id)?.total ?? 0) / 3),
      encargos3mCentavos: encargos.filter((e) => e.contaId === c.id && ENCARGOS.test(e.descricao)).reduce((s, e) => s - Number(e.valor), 0),
      projecao,
    };
  });
}

/**
 * Saídas previstas dos cartões para o fluxo de caixa, em meses sem fatura conhecida: as parcelas já
 * contratadas, no dia de vencimento do cartão. (Faturas conhecidas já entram como contas a pagar.)
 */
export async function previsaoCartoesParaFluxo(db: Db, ate: string): Promise<{ escopo: "PF" | "PJ"; vencimento: string; valorCentavos: number }[]> {
  const resumos = await resumoCartoes(db, 4);
  const saida: { escopo: "PF" | "PJ"; vencimento: string; valorCentavos: number }[] = [];
  for (const r of resumos) {
    const mesesConhecidos = new Set(r.faturas.map((f) => f.vencimento.slice(0, 7)));
    const porMes = new Map<string, { vencimento: string; valor: number }>();
    for (const p of r.parcelas) {
      if (p.vencimento > ate) continue;
      const mes = p.vencimento.slice(0, 7);
      if (mesesConhecidos.has(mes)) continue;
      const vencimento = r.conta.diaVencimento ? somarMeses(`${mes}-01`, 0, r.conta.diaVencimento) : p.vencimento;
      const atual = porMes.get(mes) ?? { vencimento, valor: 0 };
      atual.valor += p.valorCentavos;
      porMes.set(mes, atual);
    }
    for (const v of porMes.values()) saida.push({ escopo: escopoDoCartao(r.conta), vencimento: v.vencimento, valorCentavos: v.valor });
  }
  return saida;
}

export async function salvarVinculado(db: Db, v: { contaId: number; tipo: "virtual" | "adicional"; apelido: string; final: string }): Promise<void> {
  await db
    .insert(cartoesVinculados)
    .values(v)
    .onConflictDoUpdate({ target: [cartoesVinculados.contaId, cartoesVinculados.final], set: { tipo: v.tipo, apelido: v.apelido } });
}

/** Cancela (ou reativa) um cartão virtual/adicional. As compras antigas continuam ligadas a ele. */
export async function alternarVinculado(db: Db, id: number, ativo: boolean): Promise<void> {
  await db.update(cartoesVinculados).set({ ativo, canceladoEm: ativo ? null : hojeBrasil() }).where(eq(cartoesVinculados.id, id));
}

export async function excluirVinculado(db: Db, id: number): Promise<void> {
  await db.delete(cartoesVinculados).where(eq(cartoesVinculados.id, id));
}
