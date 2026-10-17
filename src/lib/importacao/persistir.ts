import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { contas, importacoes, titulares, transacoes } from "../db/schema";
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
 */
export function calcularHashesDedup(extrato: ExtratoNormalizado): string[] {
  const contagem = new Map<string, number>();
  return extrato.transacoes.map((t) => {
    const base = `${t.data}|${t.valorCentavos}`;
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

  const hashes = calcularHashesDedup(extrato);
  const contaId = conta.id;
  const formato = extrato.formato;

  return db.transaction(async (tx) => {
    const [importacao] = await tx
      .insert(importacoes)
      .values({
        contaId,
        nomeArquivo,
        hashArquivo: hash,
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
      parcelaAtual: t.parcela?.atual ?? null,
      parcelaTotal: t.parcela?.total ?? null,
    }));

    let novas = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const inseridas = await tx
        .insert(transacoes)
        .values(linhas.slice(i, i + 500))
        .onConflictDoNothing({ target: [transacoes.contaId, transacoes.hashDedup] })
        .returning({ id: transacoes.id });
      novas += inseridas.length;
    }
    const duplicadas = linhas.length - novas;
    await tx
      .update(importacoes)
      .set({ qtdNovas: novas, qtdDuplicadas: duplicadas })
      .where(eq(importacoes.id, importacao.id));

    return {
      importacaoId: importacao.id,
      contaId,
      contaApelido: conta.apelido,
      contaNova,
      instituicaoReconhecida: Boolean(extrato.instituicaoId),
      novas,
      duplicadas,
      avisos: extrato.avisos,
      extraidoPor: extrato.extraidoPor,
    };
  });
}
