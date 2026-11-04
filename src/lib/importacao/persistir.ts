import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { cartoesVinculados, contas, importacoes, titulares, transacoes } from "../db/schema";
import { registrarFatura } from "../cartoes/servico";
import { obterInstituicao } from "../instituicoes/catalogo";
import { lerArquivo, type OpcoesImportacao } from "./importar";
import { ErroImportacao, type Escopo, type ExtratoNormalizado } from "./tipos";
import { normalizarTexto } from "./util";

export function hashArquivo(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Chave de deduplicação independente do formato: conta + data + valor + ordem da ocorrência
 * daquele par (data, valor) no arquivo. Assim, o mesmo mês importado via OFX e depois via PDF
 * não duplica, mesmo com descrições escritas de jeitos diferentes, e duas compras iguais no
 * mesmo dia continuam sendo duas.
 *
 * Parcelas de cartão entram com o número da parcela: a fatura costuma repetir a data da compra
 * original em todo mês ("15/03 LOJA 03/10", depois "15/03 LOJA 04/10"), e sem isso a parcela
 * do mês seguinte seria descartada como duplicada.
 */
export function calcularHashesDedup(extrato: ExtratoNormalizado): string[] {
  const contagem = new Map<string, number>();
  return extrato.transacoes.map((t) => {
    const parcela = t.parcela ? `|p${t.parcela.atual}/${t.parcela.total}` : "";
    const base = `${t.data}|${t.valorCentavos}${parcela}`;
    const ocorrencia = contagem.get(base) ?? 0;
    contagem.set(base, ocorrencia + 1);
    return `${base}|${ocorrencia}`;
  });
}

function escopoDoDocumento(doc: string | undefined): Escopo | undefined {
  if (!doc) return undefined;
  if (doc.length === 14) return "PJ";
  if (doc.length === 11) return "PF";
  return undefined;
}

async function resolverTitular(db: Db, extrato: ExtratoNormalizado): Promise<number | undefined> {
  const doc = extrato.conta.documentoTitular;
  const tipo = escopoDoDocumento(doc);
  if (!doc || !tipo) return undefined;
  const existente = await db.query.titulares.findFirst({ where: eq(titulares.documento, doc) });
  if (existente) return existente.id;
  const [novo] = await db
    .insert(titulares)
    .values({ tipo, documento: doc, nome: extrato.conta.titular ?? (tipo === "PJ" ? "Minha empresa" : "Eu") })
    .returning({ id: titulares.id });
  return novo.id;
}

/** Acha a conta do extrato entre as existentes ou cria uma nova. */
async function resolverConta(db: Db, extrato: ExtratoNormalizado, titularId: number | undefined) {
  const { instituicaoId, conta } = extrato;
  const tipo = conta.tipo ?? "corrente";

  // Fatura de um cartão virtual/adicional já cadastrado: vai para o cartão principal.
  if (conta.finalCartao) {
    const vinculados = await db
      .select({ conta: contas })
      .from(cartoesVinculados)
      .innerJoin(contas, eq(contas.id, cartoesVinculados.contaId))
      .where(eq(cartoesVinculados.final, conta.finalCartao));
    const doMesmoEmissor = vinculados.filter((v) => !instituicaoId || !v.conta.instituicaoId || v.conta.instituicaoId === instituicaoId);
    if (doMesmoEmissor.length === 1) return doMesmoEmissor[0].conta;
  }

  if (instituicaoId) {
    const daInstituicao = await db.query.contas.findMany({ where: eq(contas.instituicaoId, instituicaoId) });
    const identificador = conta.finalCartao ?? conta.numero;
    const porNumero = identificador
      ? daInstituicao.find((c) => c.numero === conta.numero || (conta.finalCartao && c.finalCartao === conta.finalCartao))
      : undefined;
    if (porNumero) return porNumero;
    // Sem número no arquivo: só reaproveita se não houver ambiguidade.
    const mesmoTipo = daInstituicao.filter((c) => c.tipo === tipo && (!titularId || !c.titularId || c.titularId === titularId));
    if (!identificador && mesmoTipo.length === 1) return mesmoTipo[0];
  }

  const instituicao = obterInstituicao(instituicaoId);
  const nomeInstituicao = instituicao?.nome ?? extrato.instituicaoNomeLido ?? "Instituição não identificada";
  const titular = titularId ? await db.query.titulares.findFirst({ where: eq(titulares.id, titularId) }) : undefined;
  const sufixo = tipo === "cartao_credito" ? `Cartão${conta.finalCartao ? ` final ${conta.finalCartao}` : ""}` : titular?.tipo ?? "";
  const [nova] = await db
    .insert(contas)
    .values({
      instituicaoId: instituicao?.id ?? null,
      instituicaoNome: nomeInstituicao,
      apelido: `${nomeInstituicao}${sufixo ? ` · ${sufixo}` : ""}`,
      tipo,
      agencia: conta.agencia ?? null,
      numero: conta.numero ?? null,
      finalCartao: conta.finalCartao ?? null,
      titularId: titularId ?? null,
      // Com CPF/CNPJ no extrato já sabemos de quem é a conta; sem isso, fica "misto" até o usuário dizer.
      escopoPadrao: titular?.tipo ?? "misto",
    })
    .returning();
  return nova;
}

export interface ResultadoImportacao {
  importacaoId: number;
  contaId: number;
  contaApelido: string;
  contaNova: boolean;
  instituicaoReconhecida: boolean;
  novas: number;
  duplicadas: number;
  avisos: string[];
  extraidoPor: "parser" | "ia";
}

export async function importarParaBanco(
  db: Db,
  bytes: Uint8Array,
  nomeArquivo: string,
  opcoes: OpcoesImportacao & { contaId?: number } = {},
): Promise<ResultadoImportacao> {
  const hash = hashArquivo(bytes);
  const jaImportado = await db.query.importacoes.findFirst({ where: eq(importacoes.hashArquivo, hash) });
  if (jaImportado) {
    throw new ErroImportacao(`Este arquivo já foi importado (${jaImportado.nomeArquivo}).`);
  }

  const extrato = await lerArquivo(bytes, nomeArquivo, opcoes);
  if (extrato.transacoes.length === 0) {
    throw new ErroImportacao("Nenhuma transação encontrada no arquivo.");
  }
  if (extrato.formato === "desconhecido") throw new ErroImportacao("Formato não suportado.");

  const titularId = await resolverTitular(db, extrato);
  let conta;
  let contaNova = false;
  if (opcoes.contaId) {
    conta = await db.query.contas.findFirst({ where: eq(contas.id, opcoes.contaId) });
    if (!conta) throw new ErroImportacao("Conta escolhida não existe.");
  } else {
    const antes = await db.$count(contas);
    conta = await resolverConta(db, extrato, titularId);
    contaNova = (await db.$count(contas)) > antes;
  }

  const gravado = await gravarExtrato(db, extrato, { contaId: conta.id, nomeArquivo, hashArquivo: hash });
  const { novas, duplicadas } = gravado;
  if (conta.tipo === "cartao_credito") {
    // Cartão sem final cadastrado: assume o final principal da fatura.
    if (!conta.finalCartao && extrato.conta.finalCartao) {
      await db.update(contas).set({ finalCartao: extrato.conta.finalCartao }).where(eq(contas.id, conta.id));
    }
    await registrarFinaisDaFatura(db, conta.id, conta.finalCartao ?? extrato.conta.finalCartao ?? null, extrato);
  }
  if (extrato.fatura && conta.tipo === "cartao_credito") {
    await registrarFatura(db, {
      contaId: conta.id,
      vencimento: extrato.fatura.vencimento,
      fechamento: extrato.fatura.fechamento ?? null,
      valorCentavos: extrato.fatura.totalCentavos,
      minimoCentavos: extrato.fatura.minimoCentavos ?? null,
      importacaoId: gravado.importacaoId,
      origem: "importacao",
    });
  }
  return {
    importacaoId: gravado.importacaoId,
    contaId: conta.id,
    contaApelido: conta.apelido,
    contaNova,
    instituicaoReconhecida: Boolean(extrato.instituicaoId),
    novas,
    duplicadas,
    avisos: extrato.avisos,
    extraidoPor: extrato.extraidoPor,
  };
}

export interface ResultadoGravacao {
  importacaoId: number;
  novas: number;
  duplicadas: number;
  /** Para cada transação nova: posição dela em `extrato.transacoes` e o id gravado. */
  inseridas: { indice: number; id: number }[];
}

/**
 * Grava um extrato já lido numa conta: registra a importação e insere as transações,
 * ignorando as que já existem (mesma chave de deduplicação). Usado por arquivos e por integrações.
 */
export async function gravarExtrato(
  db: Db,
  extrato: ExtratoNormalizado,
  destino: { contaId: number; nomeArquivo: string; hashArquivo: string },
): Promise<ResultadoGravacao> {
  if (extrato.formato === "desconhecido") throw new ErroImportacao("Formato não suportado.");
  const hashes = calcularHashesDedup(extrato);
  const indicePorHash = new Map(hashes.map((h, i) => [h, i]));
  const { contaId, nomeArquivo } = destino;
  const formato = extrato.formato;

  return db.transaction(async (tx) => {
    const [importacao] = await tx
      .insert(importacoes)
      .values({
        contaId,
        nomeArquivo,
        hashArquivo: destino.hashArquivo,
        formato,
        extraidoPor: extrato.extraidoPor,
        periodoInicio: extrato.periodo?.inicio ?? null,
        periodoFim: extrato.periodo?.fim ?? null,
        saldoFinalCentavos: extrato.saldoFinalCentavos ?? null,
        avisos: extrato.avisos,
      })
      .returning({ id: importacoes.id });

    const linhas = extrato.transacoes.map((t, i) => ({
      contaId,
      importacaoId: importacao.id,
      data: t.data,
      descricao: t.descricao,
      descricaoNormalizada: normalizarTexto(t.descricao),
      valorCentavos: t.valorCentavos,
      idExterno: t.idExterno ?? null,
      hashDedup: hashes[i],
      nomeContraparte: t.nomeContraparte ?? null,
      documentoContraparte: t.documentoContraparte ?? null,
      finalCartao: t.finalCartao ?? null,
      parcelaAtual: t.parcela?.atual ?? null,
      parcelaTotal: t.parcela?.total ?? null,
      // Classificação já conhecida pela origem (ex.: tipo de lançamento do Asaas).
      ...(t.sugestao
        ? {
            escopo: t.sugestao.escopo ?? null,
            categoriaId: t.sugestao.categoriaId ?? null,
            natureza: t.sugestao.natureza ?? "comum",
            classificadoPor: "heuristica" as const,
            motivo: t.sugestao.motivo,
            confianca: 1,
          }
        : {}),
    }));

    const inseridas: { indice: number; id: number }[] = [];
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = await tx
        .insert(transacoes)
        .values(linhas.slice(i, i + 500))
        .onConflictDoNothing({ target: [transacoes.contaId, transacoes.hashDedup] })
        .returning({ id: transacoes.id, hashDedup: transacoes.hashDedup });
      for (const r of lote) inseridas.push({ indice: indicePorHash.get(r.hashDedup)!, id: r.id });
    }
    const novas = inseridas.length;
    const duplicadas = linhas.length - novas;
    await tx
      .update(importacoes)
      .set({ qtdNovas: novas, qtdDuplicadas: duplicadas })
      .where(eq(importacoes.id, importacao.id));

    return { importacaoId: importacao.id, novas, duplicadas, inseridas };
  });
}

/**
 * Finais que aparecem na fatura e não são o do cartão físico: registra como cartão virtual
 * (você ajusta o nome e o tipo em Cartões). Assim dá para ver o que cada virtual compra.
 */
export async function registrarFinaisDaFatura(db: Db, contaId: number, finalFisico: string | null, extrato: ExtratoNormalizado): Promise<void> {
  const finais = new Set(extrato.transacoes.map((t) => t.finalCartao).filter((f): f is string => Boolean(f) && f !== finalFisico));
  for (const final of finais) {
    await db
      .insert(cartoesVinculados)
      .values({ contaId, final, tipo: "virtual", apelido: `Cartão final ${final}`, observacao: "Encontrado na fatura" })
      .onConflictDoNothing();
  }
}
