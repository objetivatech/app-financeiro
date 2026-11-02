import { eq, inArray, sql } from "drizzle-orm";
import { classificarPendentes } from "../classificacao/executar";
import type { Db } from "../db";
import { trabalhosImportacao, type TrabalhoImportacao } from "../db/schema";
import { ErroIa } from "../ia/cliente";
import { importarParaBanco, type ResultadoImportacao } from "./persistir";
import { ErroImportacao } from "./tipos";

/**
 * Fila de importação em segundo plano, dentro do próprio processo do Next.
 * Para um usuário só, um processador por vez basta: os arquivos entram em ordem, cada um
 * pode usar a IA por alguns minutos, e no fim a classificação roda uma vez para o lote todo.
 */

const estado = globalThis as unknown as { __filaImportacao?: { ativa: boolean; classificando: boolean } };
estado.__filaImportacao ??= { ativa: false, classificando: false };
const fila = estado.__filaImportacao;

/** Situação geral: `ocupada` cobre leitura e classificação; `classificando` só a etapa final. */
export function estadoFila(): { ocupada: boolean; classificando: boolean } {
  return { ocupada: fila.ativa, classificando: fila.classificando };
}

export async function enfileirar(db: Db, bytes: Uint8Array, nomeArquivo: string, contaId?: number): Promise<number> {
  const [linha] = await db
    .insert(trabalhosImportacao)
    .values({ nomeArquivo, contaId: contaId ?? null, arquivo: Buffer.from(bytes) })
    .returning({ id: trabalhosImportacao.id });
  dispararFila(db);
  return linha.id;
}

/** Inicia o processamento se ainda não estiver rodando. Não espera terminar. */
export function dispararFila(db: Db): void {
  if (fila.ativa) return;
  fila.ativa = true;
  void processar(db)
    .catch((erro) => console.error("Fila de importação parou com erro", erro))
    .finally(() => {
      fila.ativa = false;
      fila.classificando = false;
    });
}

/** Na subida do servidor: o que estava "processando" foi interrompido; volta para a fila. */
export async function retomarFila(db: Db): Promise<void> {
  await db
    .update(trabalhosImportacao)
    .set({ status: "fila", iniciadoEm: null })
    .where(eq(trabalhosImportacao.status, "processando"));
  dispararFila(db);
}

/** Pega o próximo da fila marcando como "processando" de forma atômica. */
async function proximo(db: Db): Promise<TrabalhoImportacao | undefined> {
  const linhas = await db
    .update(trabalhosImportacao)
    .set({ status: "processando", iniciadoEm: new Date() })
    .where(
      sql`${trabalhosImportacao.id} = (select id from trabalhos_importacao where status = 'fila' order by id limit 1 for update skip locked)`,
    )
    .returning();
  return linhas[0];
}

async function processar(db: Db): Promise<void> {
  for (;;) {
    let processouAlgum = false;
    for (let trabalho = await proximo(db); trabalho; trabalho = await proximo(db)) {
      processouAlgum = true;
      await processarUm(db, trabalho);
    }
    if (!processouAlgum) return;

    // Classifica o lote inteiro de uma vez (inclui transferências entre arquivos diferentes).
    fila.classificando = true;
    try {
      const resumo = await classificarPendentes(db);
      if (resumo.erroIa) console.error("Classificação por IA falhou:", resumo.erroIa);
    } catch (erro) {
      console.error("Falha ao classificar após importação", erro);
    } finally {
      fila.classificando = false;
    }
    // Volta ao início: pode ter chegado arquivo novo enquanto classificava.
  }
}

async function processarUm(db: Db, trabalho: TrabalhoImportacao): Promise<void> {
  const inicio = Date.now();
  try {
    if (!trabalho.arquivo) throw new ErroImportacao("Arquivo não encontrado na fila.");
    const resultado: ResultadoImportacao = await importarParaBanco(db, new Uint8Array(trabalho.arquivo), trabalho.nomeArquivo, {
      contaId: trabalho.contaId ?? undefined,
    });
    await db
      .update(trabalhosImportacao)
      .set({ status: "concluido", resultado, arquivo: null, concluidoEm: new Date(), mensagem: null })
      .where(eq(trabalhosImportacao.id, trabalho.id));
    console.log(`Importado ${trabalho.nomeArquivo}: ${resultado.novas} novas em ${Math.round((Date.now() - inicio) / 1000)}s`);
  } catch (erro) {
    const conhecido = erro instanceof ErroImportacao || erro instanceof ErroIa;
    if (!conhecido) console.error(`Falha ao importar ${trabalho.nomeArquivo}`, erro);
    await db
      .update(trabalhosImportacao)
      .set({
        status: "erro",
        // Mantém o arquivo em caso de erro inesperado, para poder tentar de novo.
        arquivo: conhecido ? null : trabalho.arquivo,
        concluidoEm: new Date(),
        mensagem: conhecido
          ? (erro as Error).message
          : `Erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`.slice(0, 500),
      })
      .where(eq(trabalhosImportacao.id, trabalho.id));
  }
}

export interface SituacaoTrabalho {
  id: number;
  nomeArquivo: string;
  status: TrabalhoImportacao["status"];
  mensagem: string | null;
  resultado: ResultadoImportacao | null;
  segundos: number | null;
}

export async function situacaoDosTrabalhos(db: Db, ids: number[]): Promise<SituacaoTrabalho[]> {
  if (ids.length === 0) return [];
  const linhas = await db
    .select({
      id: trabalhosImportacao.id,
      nomeArquivo: trabalhosImportacao.nomeArquivo,
      status: trabalhosImportacao.status,
      mensagem: trabalhosImportacao.mensagem,
      resultado: trabalhosImportacao.resultado,
      iniciadoEm: trabalhosImportacao.iniciadoEm,
      concluidoEm: trabalhosImportacao.concluidoEm,
    })
    .from(trabalhosImportacao)
    .where(inArray(trabalhosImportacao.id, ids));
  return linhas.map((l) => ({
    id: l.id,
    nomeArquivo: l.nomeArquivo,
    status: l.status,
    mensagem: l.mensagem,
    resultado: (l.resultado as ResultadoImportacao | null) ?? null,
    segundos: l.iniciadoEm ? Math.round(((l.concluidoEm ?? new Date()).getTime() - l.iniciadoEm.getTime()) / 1000) : null,
  }));
}

/** Trabalhos ainda abertos ou que terminaram há pouco (para a tela mostrar ao reabrir). */
export async function trabalhosRecentes(db: Db): Promise<number[]> {
  const linhas = await db
    .select({ id: trabalhosImportacao.id })
    .from(trabalhosImportacao)
    .where(
      sql`${trabalhosImportacao.status} in ('fila','processando') or ${trabalhosImportacao.concluidoEm} > now() - interval '30 minutes'`,
    )
    .orderBy(trabalhosImportacao.id);
  return linhas.map((l) => l.id);
}
