import { and, asc, desc, eq, gte, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { resumoCartoes } from "../cartoes/servico";
import { atualizarCompromissos, contasAPagar, fluxoProjetado, lembretesPendentes, resumoDividas, saldosConhecidos } from "../compromissos/servico";
import { hojeBrasil, somarDias } from "../datas";
import type { Db } from "../db";
import { alertas, cartoesVinculados, categorias, contas, integracoes, transacoes, type Alerta } from "../db/schema";
import { indicadoresFiscais, resumoRecebiveis } from "../fiscal/indicadores";
import { deslocarMes } from "../formato";
import { media, visaoPF, visaoPJ } from "../visoes/calculo";
import { somasPorMes } from "../visoes/consultas";
import { REFERENCIAS } from "./referencias";
import { detectarAlertas, type AlertaDetectado, type Retrato } from "./regras";

/** Junta, numa foto só, tudo o que as regras precisam olhar. */
export async function montarRetrato(db: Db): Promise<Retrato> {
  const hoje = hojeBrasil();
  const mesAtual = hoje.slice(0, 7);
  const mesFechado = deslocarMes(mesAtual, -1);
  const [somas, saldos, dividas, cartoes, recebiveis, fiscal, fluxo, aPagar, lembretes, lista, paradas, revisar, cancelados] = await Promise.all([
    somasPorMes(db, deslocarMes(mesFechado, -3), mesFechado),
    saldosConhecidos(db),
    resumoDividas(db),
    resumoCartoes(db),
    resumoRecebiveis(db),
    indicadoresFiscais(db).catch(() => null),
    fluxoProjetado(db, 13),
    contasAPagar(db, 3),
    lembretesPendentes(db),
    db
      .select({
        id: transacoes.id,
        contaId: transacoes.contaId,
        contaApelido: contas.apelido,
        contaTipo: contas.tipo,
        data: transacoes.data,
        descricao: transacoes.descricao,
        descricaoNormalizada: transacoes.descricaoNormalizada,
        valorCentavos: transacoes.valorCentavos,
        escopo: transacoes.escopo,
        categoriaId: transacoes.categoriaId,
        categoriaNome: categorias.nome,
        natureza: transacoes.natureza,
        parcelaAtual: transacoes.parcelaAtual,
        parcelaTotal: transacoes.parcelaTotal,
        finalCartao: transacoes.finalCartao,
      })
      .from(transacoes)
      .innerJoin(contas, eq(contas.id, transacoes.contaId))
      .leftJoin(categorias, eq(categorias.id, transacoes.categoriaId))
      .where(and(gte(transacoes.data, somarDias(hoje, -150)), lte(transacoes.data, hoje)))
      .orderBy(asc(transacoes.data)),
    contasSemExtratoRecente(db, hoje),
    db.$count(transacoes, eq(transacoes.revisar, true)),
    db
      .select({ contaId: cartoesVinculados.contaId, contaApelido: contas.apelido, apelido: cartoesVinculados.apelido, final: cartoesVinculados.final, canceladoEm: cartoesVinculados.canceladoEm })
      .from(cartoesVinculados)
      .innerJoin(contas, eq(contas.id, cartoesVinculados.contaId))
      .where(eq(cartoesVinculados.ativo, false)),
  ]);
  // Os 3 meses fechados mais recentes = base das médias; o 4º anterior entra só na comparação do custo de vida.
  const pjs = somas.map(visaoPJ);
  const pfs = somas.map(visaoPF);
  const ultimos3 = (lista: number[]) => lista.slice(-3);
  return {
    hoje,
    mesFechado,
    pjFechado: pjs.at(-1)!,
    pfFechado: pfs.at(-1)!,
    custoDeVidaAnteriores: pfs.slice(0, -1).map((v) => v.custoDeVida + v.parcelasDividas),
    custoPjMensal: media(ultimos3(pjs.map((v) => v.impostos + v.despesas + v.parcelasDividas + v.proLabore))),
    custoPfMensal: media(ultimos3(pfs.map((v) => v.custoDeVida + v.parcelasDividas))),
    rendaPfMedia: media(ultimos3(pfs.map((v) => v.rendaTotal))),
    saldos,
    dividas,
    cartoes,
    recebiveis,
    fiscal: fiscal
      ? {
          diagnostico: fiscal.diagnostico,
          mesesComDados: fiscal.mesesComDados,
          proLaboreMensalCentavos: fiscal.perfil.proLaboreMensalCentavos,
          sujeitoFatorR: fiscal.perfil.sujeitoFatorR,
          regimeAtual: fiscal.regimeAtual,
          mesesDeFolha: fiscal.mesesDeFolha,
          fatorRPleno: fiscal.fatorRPleno,
          folhaCompletaEm: fiscal.folhaCompletaEm,
        }
      : null,
    fluxo: { semanas: fluxo.semanas, contasSemSaldo: fluxo.contasSemSaldo },
    aPagar: aPagar.pendentes,
    lembretes,
    transacoes: lista.map((t) => ({ ...t, valorCentavos: Number(t.valorCentavos) })),
    contasParadas: paradas,
    vinculadosCancelados: cancelados,
    paraRevisar: revisar,
  };
}

/** Contas ativas (não cartão, não integradas) cujo último lançamento ficou para trás. */
async function contasSemExtratoRecente(db: Db, hoje: string): Promise<{ id: number; apelido: string; ultima: string }[]> {
  const integradas = (await db.select({ contaId: integracoes.contaId }).from(integracoes)).map((i) => i.contaId).filter((x): x is number => x !== null);
  const linhas = await db
    .select({ id: contas.id, apelido: contas.apelido, ultima: max(transacoes.data) })
    .from(contas)
    .innerJoin(transacoes, eq(transacoes.contaId, contas.id))
    .where(and(eq(contas.ativa, true), ne(contas.tipo, "cartao_credito"), eq(contas.candidataEncerrar, false)))
    .groupBy(contas.id, contas.apelido);
  const limite = somarDias(hoje, -REFERENCIAS.diasSemExtrato);
  return linhas
    .filter((l): l is { id: number; apelido: string; ultima: string } => Boolean(l.ultima) && l.ultima! < limite && !integradas.includes(l.id))
    .map((l) => ({ id: l.id, apelido: l.apelido, ultima: l.ultima }));
}

const estado = globalThis as unknown as { __alertasEm?: number; __alertasRodando?: Promise<unknown> };

/**
 * Roda as regras e sincroniza a tabela de avisos:
 * - aviso novo entra ativo; o que mudou de valor é atualizado (e volta a aparecer se ficou mais grave);
 * - aviso dispensado por você não volta (para a mesma situação);
 * - aviso ativo cuja situação deixou de existir é resolvido sozinho.
 */
export async function atualizarAlertas(db: Db, opcoes: { atualizarCompromissos?: boolean } = {}): Promise<{ ativos: number; novos: number; resolvidos: number }> {
  if (opcoes.atualizarCompromissos !== false) await atualizarCompromissos(db);
  const detectados = detectarAlertas(await montarRetrato(db));
  const resultado = await gravarAlertas(db, detectados);
  estado.__alertasEm = Date.now();
  return resultado;
}

/** Igual a atualizarAlertas, mas no máximo a cada `minutos` (usado ao abrir telas). */
export async function atualizarAlertasSeNecessario(db: Db, minutos = 10): Promise<void> {
  if (estado.__alertasEm && Date.now() - estado.__alertasEm < minutos * 60_000) return;
  if (estado.__alertasRodando) {
    await estado.__alertasRodando;
    return;
  }
  estado.__alertasRodando = atualizarAlertas(db)
    .catch((erro) => console.error("Falha ao atualizar avisos", erro))
    .finally(() => (estado.__alertasRodando = undefined));
  await estado.__alertasRodando;
}

export async function gravarAlertas(db: Db, detectados: AlertaDetectado[]): Promise<{ ativos: number; novos: number; resolvidos: number }> {
  const existentes = await db.select({ id: alertas.id, chave: alertas.chave, status: alertas.status }).from(alertas);
  const porChave = new Map(existentes.map((e) => [e.chave, e]));
  let novos = 0;
  for (const a of detectados) {
    const antes = porChave.get(a.chave);
    if (antes?.status === "dispensado") continue;
    if (!antes) novos++;
    const valores = {
      chave: a.chave,
      tipo: a.tipo,
      gravidade: a.gravidade,
      escopo: a.escopo,
      titulo: a.titulo,
      mensagem: a.mensagem,
      recomendacao: a.recomendacao,
      link: a.link,
      pergunta: a.pergunta,
      transacaoId: a.transacaoId,
    };
    await db
      .insert(alertas)
      .values(valores)
      .onConflictDoUpdate({
        target: alertas.chave,
        set: {
          ...valores,
          status: "ativo",
          resolvidoEm: null,
          // Voltou depois de resolvido, ou ficou mais grave: mostra de novo na janela de avisos.
          vistoEm: sql`case when ${alertas.status} = 'resolvido' or excluded.gravidade > ${alertas.gravidade} then null else ${alertas.vistoEm} end`,
          atualizadoEm: new Date(),
        },
        setWhere: ne(alertas.status, "dispensado"),
      });
  }
  const chaves = new Set(detectados.map((a) => a.chave));
  // A carta da semana não vem das regras: vale por 7 dias e então sai da lista.
  const sumiram = existentes.filter((e) => e.status === "ativo" && !chaves.has(e.chave) && !e.chave.startsWith("carta:")).map((e) => e.id);
  await db
    .update(alertas)
    .set({ status: "resolvido", resolvidoEm: new Date() })
    .where(and(eq(alertas.tipo, "carta"), eq(alertas.status, "ativo"), lte(alertas.criadoEm, new Date(Date.now() - 7 * 86_400_000))));
  if (sumiram.length > 0) {
    await db.update(alertas).set({ status: "resolvido", resolvidoEm: new Date(), atualizadoEm: new Date() }).where(inArray(alertas.id, sumiram));
  }
  return { ativos: chaves.size, novos, resolvidos: sumiram.length };
}

const ORDEM_GRAVIDADE = sql`case ${alertas.gravidade} when 'critico' then 0 when 'atencao' then 1 else 2 end`;

/** Avisos ativos (e não adiados), dos mais graves para os mais leves. */
export async function listarAlertasAtivos(db: Db, filtro: { escopo?: "PF" | "PJ"; limite?: number } = {}): Promise<Alerta[]> {
  const hoje = hojeBrasil();
  return db
    .select()
    .from(alertas)
    .where(
      and(
        eq(alertas.status, "ativo"),
        or(isNull(alertas.adiadoAte), lte(alertas.adiadoAte, hoje)),
        filtro.escopo ? or(eq(alertas.escopo, filtro.escopo), isNull(alertas.escopo)) : undefined,
      ),
    )
    .orderBy(ORDEM_GRAVIDADE, desc(alertas.atualizadoEm))
    .limit(filtro.limite ?? 200);
}

/** Avisos que ainda não apareceram na janela (críticos e de atenção). */
export async function alertasParaJanela(db: Db): Promise<Alerta[]> {
  const hoje = hojeBrasil();
  return db
    .select()
    .from(alertas)
    .where(
      and(
        eq(alertas.status, "ativo"),
        isNull(alertas.vistoEm),
        or(inArray(alertas.gravidade, ["critico", "atencao"]), eq(alertas.tipo, "carta")),
        or(isNull(alertas.adiadoAte), lte(alertas.adiadoAte, hoje)),
      ),
    )
    .orderBy(ORDEM_GRAVIDADE, desc(alertas.atualizadoEm))
    .limit(6);
}

export async function contarAlertasAtivos(db: Db): Promise<{ total: number; criticos: number }> {
  const hoje = hojeBrasil();
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      criticos: sql<number>`count(*) filter (where ${alertas.gravidade} = 'critico')::int`,
    })
    .from(alertas)
    .where(and(eq(alertas.status, "ativo"), or(isNull(alertas.adiadoAte), lte(alertas.adiadoAte, hoje))));
  return r;
}

/** Avisos ligados a transações (para mostrar junto delas na lista). */
export async function alertasDasTransacoes(db: Db, ids: number[]): Promise<Map<number, Alerta[]>> {
  const mapa = new Map<number, Alerta[]>();
  if (ids.length === 0) return mapa;
  const linhas = await db
    .select()
    .from(alertas)
    .where(and(inArray(alertas.transacaoId, ids), eq(alertas.status, "ativo")));
  for (const a of linhas) mapa.set(a.transacaoId!, [...(mapa.get(a.transacaoId!) ?? []), a]);
  return mapa;
}

export async function marcarVistos(db: Db, ids: number[]): Promise<void> {
  if (ids.length) await db.update(alertas).set({ vistoEm: new Date() }).where(inArray(alertas.id, ids));
}

export async function adiarAlerta(db: Db, id: number, dias = 7): Promise<void> {
  await db.update(alertas).set({ adiadoAte: somarDias(hojeBrasil(), dias), vistoEm: new Date() }).where(eq(alertas.id, id));
}

/** "Já resolvi / não mostrar de novo": esta situação não volta a gerar aviso. */
export async function dispensarAlerta(db: Db, id: number): Promise<void> {
  await db.update(alertas).set({ status: "dispensado", resolvidoEm: new Date(), vistoEm: new Date() }).where(eq(alertas.id, id));
}

/** Últimos avisos que se resolveram sozinhos (para mostrar o progresso). */
export async function alertasResolvidosRecentes(db: Db, dias = 30): Promise<Alerta[]> {
  return db
    .select()
    .from(alertas)
    .where(and(eq(alertas.status, "resolvido"), gte(alertas.resolvidoEm, new Date(Date.now() - dias * 86_400_000))))
    .orderBy(desc(alertas.resolvidoEm))
    .limit(20);
}


