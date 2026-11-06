import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { hojeBrasil, somarDias } from "../datas";
import type { Db } from "../db";
import { conciliarFaturas, previsaoCartoesParaFluxo } from "../cartoes/servico";
import { atualizarImpostosAPagar, PADRAO_DAS, PADRAO_INSS } from "../fiscal/impostos-a-pagar";
import { compromissos, contas, dividas, faturas, importacoes, integracoes, recorrencias, transacoes } from "../db/schema";
import { casarPagamentos, PADRAO_GUIA_IMPOSTO, taxaMensal, vencimentosMensais, type ParcelaPlanejada } from "./calculo";

type EscopoDb = "PF" | "PJ";
export type TipoDivida = (typeof dividas.$inferInsert)["tipo"];

export interface NovaDivida {
  nome: string;
  credor?: string | null;
  tipo: NonNullable<TipoDivida>;
  escopo: EscopoDb;
  contaId?: number | null;
  valorRecebidoCentavos?: number | null;
  diasTolerancia?: number | null;
  consequenciaAtraso?: string | null;
  lembreteAposPagar?: string | null;
  observacao?: string | null;
  parcelas: ParcelaPlanejada[];
  /** Quantas das primeiras parcelas já foram pagas antes do cadastro. */
  parcelasJaPagas?: number;
}

/** Cadastra a dívida e cria uma conta a pagar para cada parcela. */
export async function criarDivida(db: Db, d: NovaDivida): Promise<number> {
  if (d.parcelas.length === 0) throw new Error("Informe ao menos uma parcela.");
  return db.transaction(async (tx) => {
    const [divida] = await tx
      .insert(dividas)
      .values({
        nome: d.nome,
        credor: d.credor ?? null,
        tipo: d.tipo,
        escopo: d.escopo,
        contaId: d.contaId ?? null,
        valorRecebidoCentavos: d.valorRecebidoCentavos ?? null,
        diasTolerancia: d.diasTolerancia ?? null,
        consequenciaAtraso: d.consequenciaAtraso ?? null,
        lembreteAposPagar: d.lembreteAposPagar ?? null,
        observacao: d.observacao ?? null,
      })
      .returning({ id: dividas.id });
    const pagas = d.parcelasJaPagas ?? 0;
    await tx.insert(compromissos).values(
      d.parcelas.map((p, i) => ({
        tipo: "pagar" as const,
        escopo: d.escopo,
        descricao: `${d.nome} (${p.numero}/${d.parcelas.length})`,
        valorCentavos: p.valorCentavos,
        vencimento: p.vencimento,
        status: i < pagas ? ("pago" as const) : ("aberto" as const),
        dataPagamento: i < pagas ? p.vencimento : null,
        // Parcelas pagas antes do cadastro não pedem o lembrete de novo.
        lembreteCumpridoEm: i < pagas ? new Date() : null,
        categoriaId: d.escopo === "PJ" ? "pj_dividas" : "pf_dividas",
        contaId: d.contaId ?? null,
        origem: "divida",
        idExterno: `${divida.id}:${p.numero}`,
        parcelaAtual: p.numero,
        parcelaTotal: d.parcelas.length,
        dividaId: divida.id,
      })),
    );
    return divida.id;
  });
}

export interface NovaRecorrencia {
  descricao: string;
  tipo: "pagar" | "receber";
  escopo: EscopoDb;
  valorCentavos: number;
  diaVencimento: number;
  categoriaId?: string | null;
  contaId?: number | null;
  padraoExtrato?: string | null;
  inicio: string;
  fim?: string | null;
}

export async function criarRecorrencia(db: Db, r: NovaRecorrencia): Promise<number> {
  const [linha] = await db
    .insert(recorrencias)
    .values({ ...r, categoriaId: r.categoriaId ?? null, contaId: r.contaId ?? null, padraoExtrato: r.padraoExtrato ?? null, fim: r.fim ?? null })
    .returning({ id: recorrencias.id });
  await atualizarCompromissos(db);
  return linha.id;
}

export async function criarContaAvulsa(
  db: Db,
  c: { descricao: string; tipo: "pagar" | "receber"; escopo: EscopoDb; valorCentavos: number; vencimento: string; contaId?: number | null; categoriaId?: string | null },
): Promise<void> {
  await db.insert(compromissos).values({
    ...c,
    contaId: c.contaId ?? null,
    categoriaId: c.categoriaId ?? null,
    origem: "manual",
    idExterno: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    status: c.vencimento < hojeBrasil() ? "vencido" : "aberto",
  });
}

export async function marcarPago(db: Db, id: number, data: string): Promise<void> {
  // Fatura de cartão: a marcação fica na fatura (a conciliação das faturas respeita).
  await db.update(faturas).set({ pagaEm: data }).where(eq(faturas.compromissoId, id));
  await db
    .update(compromissos)
    .set({ status: "pago", dataPagamento: data, atualizadoEm: new Date() })
    .where(and(eq(compromissos.id, id), ne(compromissos.origem, "asaas")));
}

export async function desfazerPagamento(db: Db, id: number): Promise<void> {
  const hoje = hojeBrasil();
  await db.update(faturas).set({ pagaEm: null }).where(eq(faturas.compromissoId, id));
  await db
    .update(compromissos)
    .set({
      status: sql`case when ${compromissos.vencimento} < ${hoje} then 'vencido'::status_compromisso else 'aberto'::status_compromisso end`,
      dataPagamento: null,
      transacaoId: null,
      lembreteCumpridoEm: null,
      atualizadoEm: new Date(),
    })
    .where(and(eq(compromissos.id, id), ne(compromissos.origem, "asaas")));
}

export async function cumprirLembrete(db: Db, id: number): Promise<void> {
  await db.update(compromissos).set({ lembreteCumpridoEm: new Date() }).where(eq(compromissos.id, id));
}

function mesesAFrente(hoje: string, quantos: number): string[] {
  const [ano, mes] = hoje.split("-").map(Number);
  return Array.from({ length: quantos }, (_, i) => new Date(Date.UTC(ano, mes - 1 + i, 1)).toISOString().slice(0, 7));
}

/**
 * Mantém as contas a pagar em dia (roda depois de importações, da sincronização e ao abrir as telas):
 * 1. gera os previstos das contas fixas para este mês e os próximos 3 (cobre as 13 semanas do fluxo);
 * 2. marca como vencido o que passou da data;
 * 3. concilia com o extrato: uma saída de mesmo valor perto do vencimento quita o compromisso.
 */
export async function atualizarCompromissos(db: Db): Promise<{ gerados: number; conciliados: number }> {
  const hoje = hojeBrasil();
  let gerados = 0;
  // DAS e INSS estimados pelas notas (vencem dia 20).
  await atualizarImpostosAPagar(db).catch((erro) => console.error("Falha ao estimar impostos a pagar", erro));

  const ativas = await db.query.recorrencias.findMany({ where: eq(recorrencias.ativa, true) });
  for (const r of ativas) {
    for (const mes of mesesAFrente(hoje, 4)) {
      const [vencimento] = vencimentosMensais(`${mes}-01`, 1, r.diaVencimento);
      if (vencimento < r.inicio || (r.fim && vencimento > r.fim)) continue;
      const inseridos = await db
        .insert(compromissos)
        .values({
          tipo: r.tipo === "receber" ? "receber" : "pagar",
          escopo: r.escopo,
          descricao: r.descricao,
          valorCentavos: r.valorCentavos,
          vencimento,
          status: vencimento < hoje ? "vencido" : "aberto",
          categoriaId: r.categoriaId,
          contaId: r.contaId,
          origem: "recorrencia",
          idExterno: `${r.id}:${mes}`,
          recorrenciaId: r.id,
        })
        .onConflictDoNothing({ target: [compromissos.origem, compromissos.idExterno] })
        .returning({ id: compromissos.id });
      gerados += inseridos.length;
    }
  }

  await db
    .update(compromissos)
    .set({ status: "vencido" })
    .where(and(eq(compromissos.status, "aberto"), sql`${compromissos.vencimento} < ${hoje}`, ne(compromissos.origem, "asaas")));

  // Conciliação das contas a pagar.
  const pendentes = await db
    .select({
      id: compromissos.id,
      valorCentavos: compromissos.valorCentavos,
      vencimento: compromissos.vencimento,
      contaId: compromissos.contaId,
      padraoExtrato: recorrencias.padraoExtrato,
      categoriaId: compromissos.categoriaId,
      escopo: compromissos.escopo,
      tipoDivida: dividas.tipo,
      origem: compromissos.origem,
      idExterno: compromissos.idExterno,
    })
    .from(compromissos)
    .leftJoin(recorrencias, eq(recorrencias.id, compromissos.recorrenciaId))
    .leftJoin(dividas, eq(dividas.id, compromissos.dividaId))
    // Faturas de cartão têm conciliação própria (pagamento em várias vezes, saldo que rola): conciliarFaturas.
    .where(and(eq(compromissos.tipo, "pagar"), ne(compromissos.origem, "fatura"), inArray(compromissos.status, ["aberto", "vencido"]), lte(compromissos.vencimento, somarDias(hoje, 7))));
  let conciliados = 0;
  if (pendentes.length > 0) {
    const datas = pendentes.map((p) => p.vencimento).sort();
    const jaUsadas = db.select({ id: compromissos.transacaoId }).from(compromissos).where(isNotNull(compromissos.transacaoId));
    const candidatas = await db
      .select({
        id: transacoes.id,
        data: transacoes.data,
        valorCentavos: transacoes.valorCentavos,
        contaId: transacoes.contaId,
        descricaoNormalizada: transacoes.descricaoNormalizada,
        classificadoPor: transacoes.classificadoPor,
      })
      .from(transacoes)
      .where(
        and(
          gte(transacoes.data, somarDias(datas[0], -7)),
          lte(transacoes.data, somarDias(datas[datas.length - 1], 7)),
          sql`${transacoes.valorCentavos} < 0`,
          notInArray(transacoes.id, jaUsadas),
        ),
      );
    const pares = casarPagamentos(
      pendentes.map((p) => ({
        ...p,
        padraoExtrato: p.padraoExtrato ? p.padraoExtrato.toUpperCase() : null,
        // Parcelamento de imposto: o valor real (com Selic) difere um pouco do estimado.
        padraoRegex:
          p.tipoDivida === "parcelamento_imposto"
            ? PADRAO_GUIA_IMPOSTO
            : p.origem === "imposto"
              ? p.idExterno?.startsWith("das:")
                ? PADRAO_DAS
                : PADRAO_INSS
              : null,
        // DAS e INSS são estimados: o valor real (PGDAS-D) pode diferir bem mais que 5%.
        tolerancia: p.origem === "imposto" ? 0.3 : undefined,
      })),
      candidatas,
    );
    const porId = new Map(pendentes.map((p) => [p.id, p]));
    const transacaoPorId = new Map(candidatas.map((t) => [t.id, t]));
    for (const { compromissoId, transacaoId } of pares) {
      const t = transacaoPorId.get(transacaoId)!;
      const c = porId.get(compromissoId)!;
      await db
        .update(compromissos)
        // Guarda o valor efetivamente pago (contas de consumo e parcelas com Selic variam um pouco).
        .set({ status: "pago", dataPagamento: t.data, transacaoId, valorCentavos: -Number(t.valorCentavos), atualizadoEm: new Date() })
        .where(eq(compromissos.id, compromissoId));
      // A transação herda a categoria do compromisso, a menos que você já a tenha classificado.
      if (c.categoriaId && t.classificadoPor !== "usuario") {
        // Fatura de cartão paga é movimentação: as compras já foram contadas no cartão.
        const ehFatura = c.categoriaId === "mov_fatura";
        await db
          .update(transacoes)
          .set({
            categoriaId: c.categoriaId,
            escopo: c.escopo,
            classificadoPor: "regra",
            motivo: ehFatura ? "Pagamento de fatura (conta a pagar conciliada)" : "Conta a pagar conciliada",
            revisar: false,
            ...(ehFatura ? { natureza: "pagamento_fatura" as const } : {}),
          })
          .where(eq(transacoes.id, transacaoId));
      }
      conciliados++;
    }
  }
  conciliados += await conciliarFaturas(db);
  return { gerados, conciliados };
}

export interface ItemAPagar {
  id: number;
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  status: "aberto" | "vencido" | "pago" | "cancelado";
  escopo: EscopoDb;
  origem: string;
  dividaId: number | null;
  dataPagamento: string | null;
}

/** Contas a pagar em aberto/vencidas até `dias` à frente, mais as pagas nos últimos 15 dias. */
export async function contasAPagar(db: Db, dias = 30): Promise<{ pendentes: ItemAPagar[]; pagasRecentes: ItemAPagar[] }> {
  const hoje = hojeBrasil();
  const colunas = {
    id: compromissos.id,
    descricao: compromissos.descricao,
    valorCentavos: compromissos.valorCentavos,
    vencimento: compromissos.vencimento,
    status: compromissos.status,
    escopo: compromissos.escopo,
    origem: compromissos.origem,
    dividaId: compromissos.dividaId,
    dataPagamento: compromissos.dataPagamento,
  };
  const [pendentes, pagasRecentes] = await Promise.all([
    db
      .select(colunas)
      .from(compromissos)
      .where(and(eq(compromissos.tipo, "pagar"), inArray(compromissos.status, ["aberto", "vencido"]), lte(compromissos.vencimento, somarDias(hoje, dias))))
      .orderBy(asc(compromissos.vencimento)),
    db
      .select(colunas)
      .from(compromissos)
      .where(and(eq(compromissos.tipo, "pagar"), eq(compromissos.status, "pago"), gte(compromissos.dataPagamento, somarDias(hoje, -15))))
      .orderBy(desc(compromissos.dataPagamento)),
  ]);
  return { pendentes, pagasRecentes };
}

export interface ResumoDivida {
  id: number;
  nome: string;
  credor: string | null;
  tipo: string;
  escopo: EscopoDb;
  parcelasTotal: number;
  parcelasPagas: number;
  totalCentavos: number;
  pagoCentavos: number;
  restanteCentavos: number;
  proximaParcela: { vencimento: string; valorCentavos: number } | null;
  ultimoVencimento: string | null;
  /** Parcela mais atrasada, em dias (0 = em dia). */
  diasAtraso: number;
  diasTolerancia: number | null;
  consequenciaAtraso: string | null;
  taxaMensal: number | null;
  /** Comprometimento mensal atual (parcela do mês corrente ou da próxima). */
  parcelaMensalCentavos: number;
}

export async function resumoDividas(db: Db): Promise<ResumoDivida[]> {
  const hoje = hojeBrasil();
  const lista = await db.query.dividas.findMany({ where: eq(dividas.ativa, true), orderBy: [asc(dividas.nome)] });
  if (lista.length === 0) return [];
  const parcelas = await db
    .select({
      dividaId: compromissos.dividaId,
      valorCentavos: compromissos.valorCentavos,
      vencimento: compromissos.vencimento,
      status: compromissos.status,
    })
    .from(compromissos)
    .where(and(inArray(compromissos.dividaId, lista.map((d) => d.id)), ne(compromissos.status, "cancelado")))
    .orderBy(asc(compromissos.vencimento));
  return lista.map((d) => {
    const ps = parcelas.filter((p) => p.dividaId === d.id);
    const pagas = ps.filter((p) => p.status === "pago");
    const abertas = ps.filter((p) => p.status !== "pago");
    const atrasadas = abertas.filter((p) => p.vencimento < hoje);
    const proxima = abertas[0] ?? null;
    return {
      id: d.id,
      nome: d.nome,
      credor: d.credor,
      tipo: d.tipo,
      escopo: d.escopo,
      parcelasTotal: ps.length,
      parcelasPagas: pagas.length,
      totalCentavos: ps.reduce((s, p) => s + p.valorCentavos, 0),
      pagoCentavos: pagas.reduce((s, p) => s + p.valorCentavos, 0),
      restanteCentavos: abertas.reduce((s, p) => s + p.valorCentavos, 0),
      proximaParcela: proxima ? { vencimento: proxima.vencimento, valorCentavos: proxima.valorCentavos } : null,
      ultimoVencimento: ps.at(-1)?.vencimento ?? null,
      diasAtraso: atrasadas.length ? Math.round((Date.parse(hoje) - Date.parse(atrasadas[0].vencimento)) / 86_400_000) : 0,
      diasTolerancia: d.diasTolerancia,
      consequenciaAtraso: d.consequenciaAtraso,
      taxaMensal: d.valorRecebidoCentavos ? taxaMensal(d.valorRecebidoCentavos, ps) : null,
      parcelaMensalCentavos: proxima?.valorCentavos ?? 0,
    };
  });
}

export interface LembretePendente {
  compromissoId: number;
  descricao: string;
  dataPagamento: string;
  lembrete: string;
}

/** Pagamentos de dívidas com lembrete (ex.: enviar comprovante) ainda não marcado como feito. */
export async function lembretesPendentes(db: Db): Promise<LembretePendente[]> {
  const linhas = await db
    .select({
      compromissoId: compromissos.id,
      descricao: compromissos.descricao,
      dataPagamento: compromissos.dataPagamento,
      lembrete: dividas.lembreteAposPagar,
    })
    .from(compromissos)
    .innerJoin(dividas, eq(dividas.id, compromissos.dividaId))
    .where(
      and(
        eq(compromissos.status, "pago"),
        isNull(compromissos.lembreteCumpridoEm),
        isNotNull(dividas.lembreteAposPagar),
        gte(compromissos.dataPagamento, somarDias(hojeBrasil(), -30)),
      ),
    )
    .orderBy(asc(compromissos.dataPagamento));
  return linhas.filter((l): l is LembretePendente => Boolean(l.lembrete && l.dataPagamento));
}

export interface SemanaFluxo {
  inicio: string;
  fim: string;
  PJ: { entradas: number; saidas: number; saldo: number };
  PF: { entradas: number; saidas: number; saldo: number };
}

/** Último saldo conhecido de cada conta (fim do último extrato importado) e do Asaas (API), por escopo. */
export async function saldosConhecidos(db: Db): Promise<{ PJ: number; PF: number; contasSemSaldo: number }> {
  const listaContas = await db.query.contas.findMany({ where: and(eq(contas.ativa, true), ne(contas.tipo, "cartao_credito")) });
  const ultimos = await db
    .selectDistinctOn([importacoes.contaId], { contaId: importacoes.contaId, saldo: importacoes.saldoFinalCentavos })
    .from(importacoes)
    .where(isNotNull(importacoes.saldoFinalCentavos))
    .orderBy(importacoes.contaId, desc(importacoes.periodoFim), desc(importacoes.id));
  const saldoPorConta = new Map(ultimos.map((u) => [u.contaId, Number(u.saldo)]));
  const asaas = await db.query.integracoes.findFirst({ where: eq(integracoes.id, "asaas") });
  const saldoAsaas = (asaas?.dados as { saldoCentavos?: number | null } | undefined)?.saldoCentavos;
  if (asaas?.contaId && typeof saldoAsaas === "number") saldoPorConta.set(asaas.contaId, saldoAsaas);

  const total = { PJ: 0, PF: 0, contasSemSaldo: 0 };
  for (const c of listaContas) {
    const saldo = saldoPorConta.get(c.id);
    if (saldo === undefined) {
      total.contasSemSaldo++;
      continue;
    }
    // Conta mista conta como pessoal (o dinheiro está no seu nome).
    total[c.escopoPadrao === "PJ" ? "PJ" : "PF"] += saldo;
  }
  return total;
}

/**
 * Fluxo de caixa projetado por semana: parte do saldo conhecido e soma o que está previsto para
 * entrar (cobranças, contas fixas a receber) e sair (parcelas, contas fixas, contas avulsas).
 * Atrasados entram na primeira semana.
 */
export async function fluxoProjetado(db: Db, semanas = 13): Promise<{ semanas: SemanaFluxo[]; saldoInicial: { PJ: number; PF: number }; contasSemSaldo: number }> {
  const hoje = hojeBrasil();
  const fimPeriodo = somarDias(hoje, semanas * 7 - 1);
  const saldos = await saldosConhecidos(db);
  const linhas = await db
    .select({
      tipo: compromissos.tipo,
      escopo: compromissos.escopo,
      valor: compromissos.valorCentavos,
      vencimento: compromissos.vencimento,
      categoriaId: compromissos.categoriaId,
      contaId: compromissos.contaId,
      origem: compromissos.origem,
      descricao: compromissos.descricao,
    })
    .from(compromissos)
    .where(and(inArray(compromissos.status, ["aberto", "vencido"]), lte(compromissos.vencimento, fimPeriodo), or(eq(compromissos.tipo, "pagar"), eq(compromissos.tipo, "receber"))));

  // Parcelas cadastradas num cartão (ex.: compra parcelada lançada como dívida) já estão dentro da
  // fatura quando ela é conhecida: nesse mês, conta só a fatura.
  const cartoes = new Set((await db.query.contas.findMany({ where: eq(contas.tipo, "cartao_credito"), columns: { id: true } })).map((c) => c.id));
  const faturasConhecidas = new Set(
    (await db.select({ contaId: faturas.contaId, vencimento: faturas.vencimento }).from(faturas)).map((f) => `${f.contaId}|${f.vencimento.slice(0, 7)}`),
  );
  const previstos: { tipo: "pagar" | "receber"; escopo: EscopoDb; valor: number; vencimento: string }[] = [];
  for (const l of linhas) {
    if (l.origem !== "fatura" && l.contaId !== null && cartoes.has(l.contaId) && faturasConhecidas.has(`${l.contaId}|${l.vencimento.slice(0, 7)}`)) continue;
    previstos.push({ tipo: l.tipo, escopo: l.escopo, valor: Number(l.valor), vencimento: l.vencimento });
    // Pró-labore e retiradas previstas saem da empresa e entram na sua conta pessoal.
    const paraOSocio = l.categoriaId === "mov_socio" || /pr[oó].?labore|distribui[cç][aã]o de lucros/i.test(l.descricao);
    if (paraOSocio && l.escopo === "PJ" && l.tipo === "pagar") {
      previstos.push({ tipo: "receber", escopo: "PF", valor: Number(l.valor), vencimento: l.vencimento });
    }
  }
  for (const p of await previsaoCartoesParaFluxo(db, fimPeriodo)) {
    previstos.push({ tipo: "pagar", escopo: p.escopo, valor: p.valorCentavos, vencimento: p.vencimento });
  }

  const resultado: SemanaFluxo[] = [];
  let saldoPJ = saldos.PJ;
  let saldoPF = saldos.PF;
  for (let i = 0; i < semanas; i++) {
    const inicio = somarDias(hoje, i * 7);
    const fim = somarDias(hoje, i * 7 + 6);
    const daSemana = previstos.filter((p) => (i === 0 ? p.vencimento <= fim : p.vencimento >= inicio && p.vencimento <= fim));
    const soma = (escopo: EscopoDb, tipo: "pagar" | "receber") =>
      daSemana.filter((p) => p.escopo === escopo && p.tipo === tipo).reduce((s, p) => s + Number(p.valor), 0);
    const pj = { entradas: soma("PJ", "receber"), saidas: soma("PJ", "pagar") };
    const pf = { entradas: soma("PF", "receber"), saidas: soma("PF", "pagar") };
    saldoPJ += pj.entradas - pj.saidas;
    saldoPF += pf.entradas - pf.saidas;
    resultado.push({ inicio, fim, PJ: { ...pj, saldo: saldoPJ }, PF: { ...pf, saldo: saldoPF } });
  }
  return { semanas: resultado, saldoInicial: { PJ: saldos.PJ, PF: saldos.PF }, contasSemSaldo: saldos.contasSemSaldo };
}
