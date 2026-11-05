import { and, eq, inArray, sql } from "drizzle-orm";
import { classificarPendentes } from "../classificacao/executar";
import { atualizarCompromissos } from "../compromissos/servico";
import { atualizarAlertas } from "../consultor/alertas";
import type { Db } from "../db";
import { trabalhosImportacao, type TrabalhoImportacao } from "../db/schema";
import { ErroIa } from "../ia/cliente";
import { importarParaBanco, type ResultadoImportacao } from "./persistir";
import { cifrar, decifrar, ErroSenhaPdf, guardarSenha } from "./senha-pdf";
import { ErroImportacao } from "./tipos";

/**
 * Fila de importação em segundo plano, dentro do próprio processo do Next.
 * Para um usuário só, um processador por vez basta: os arquivos entram em ordem, cada um
 * pode usar a IA por alguns minutos, e no fim a classificação roda uma vez para o lote todo.
 */

const estado = globalThis as unknown as {
  __filaImportacao?: {
    ativa: boolean;
    classificando: boolean;
    /** Leitura ou classificação em andamento, para poder interromper. */
    atual?: AbortController;
    /** O usuário cancelou neste lote: a classificação final roda sem IA. */
    cancelada?: boolean;
  };
};
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

const MENSAGEM_CANCELADO = "Cancelado por você.";

/**
 * Cancela o que ainda está na fila e interrompe a leitura em andamento.
 * O que já foi importado continua importado (dá para excluir pela tela de Contas).
 */
export async function cancelarFila(db: Db): Promise<number> {
  const cancelados = await db
    .update(trabalhosImportacao)
    .set({ status: "erro", mensagem: MENSAGEM_CANCELADO, arquivo: null, senha: null, concluidoEm: new Date() })
    .where(inArray(trabalhosImportacao.status, ["fila", "senha"]))
    .returning({ id: trabalhosImportacao.id });
  const emAndamento = fila.atual;
  if (fila.ativa) fila.cancelada = true;
  emAndamento?.abort();
  return cancelados.length + (emAndamento ? 1 : 0);
}

/**
 * Você digitou a senha de um PDF que a pediu: volta para a fila com a senha (cifrada).
 * `lembrar` guarda a senha para abrir os próximos arquivos sozinho, se ela funcionar.
 */
export async function informarSenha(db: Db, id: number, senha: string, lembrar: boolean): Promise<boolean> {
  const r = await db
    .update(trabalhosImportacao)
    .set({ status: "fila", senha: cifrar(senha.slice(0, 200)), lembrarSenha: lembrar, mensagem: null, concluidoEm: null })
    .where(and(eq(trabalhosImportacao.id, id), eq(trabalhosImportacao.status, "senha")))
    .returning({ id: trabalhosImportacao.id });
  if (r.length) dispararFila(db);
  return r.length > 0;
}

/** Desiste de um PDF que pede senha. */
export async function descartarTrabalho(db: Db, id: number): Promise<void> {
  await db
    .update(trabalhosImportacao)
    .set({ status: "erro", mensagem: MENSAGEM_CANCELADO, arquivo: null, senha: null, concluidoEm: new Date() })
    .where(and(eq(trabalhosImportacao.id, id), eq(trabalhosImportacao.status, "senha")));
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
    const controle = new AbortController();
    fila.atual = controle;
    try {
      // Após um cancelamento, classifica só com regras (rápido); a IA fica para depois, pelo botão
      // "Classificar com IA" em Transações. Cancelar durante esta etapa também a interrompe.
      const usarIa = !fila.cancelada;
      fila.cancelada = false;
      const resumo = await classificarPendentes(db, { usarIa, signal: controle.signal });
      if (resumo.erroIa) console.error("Classificação por IA falhou:", resumo.erroIa);
      // Pagamentos que acabaram de entrar podem quitar contas a pagar.
      await atualizarCompromissos(db).catch((erro) => console.error("Falha ao conciliar contas a pagar", erro));
      // O que entrou pode gerar avisos (mistura, encargos, gasto fora do padrão...) ou resolver outros.
      await atualizarAlertas(db, { atualizarCompromissos: false }).catch((erro) => console.error("Falha ao atualizar avisos", erro));
    } catch (erro) {
      console.error("Falha ao classificar após importação", erro);
    } finally {
      fila.classificando = false;
      fila.atual = undefined;
    }
    // Volta ao início: pode ter chegado arquivo novo enquanto classificava.
  }
}

async function processarUm(db: Db, trabalho: TrabalhoImportacao): Promise<void> {
  const inicio = Date.now();
  const controle = new AbortController();
  fila.atual = controle;
  try {
    if (!trabalho.arquivo) throw new ErroImportacao("Arquivo não encontrado na fila.");
    const senhaInformada = trabalho.senha ? decifrar(trabalho.senha) : null;
    let senhaQueAbriu: string | null = null;
    const resultado: ResultadoImportacao = await importarParaBanco(db, new Uint8Array(trabalho.arquivo), trabalho.nomeArquivo, {
      contaId: trabalho.contaId ?? undefined,
      signal: controle.signal,
      senhaInformada,
      aoAbrirComSenha: (s) => (senhaQueAbriu = s),
    });
    // Guarda só a senha que você digitou e que de fato abriu o arquivo.
    if (trabalho.lembrarSenha && senhaInformada && senhaQueAbriu === senhaInformada) await guardarSenha(db, senhaInformada);
    await db
      .update(trabalhosImportacao)
      .set({ status: "concluido", resultado, arquivo: null, senha: null, concluidoEm: new Date(), mensagem: null })
      .where(eq(trabalhosImportacao.id, trabalho.id));
    console.log(`Importado ${trabalho.nomeArquivo}: ${resultado.novas} novas em ${Math.round((Date.now() - inicio) / 1000)}s`);
  } catch (erroOriginal) {
    if (erroOriginal instanceof ErroSenhaPdf) {
      // Mantém o arquivo e espera você digitar a senha na tela de Importar.
      await db
        .update(trabalhosImportacao)
        .set({ status: "senha", senha: null, mensagem: erroOriginal.message, concluidoEm: new Date() })
        .where(eq(trabalhosImportacao.id, trabalho.id));
      return;
    }
    // Cancelamento pelo usuário: a chamada à IA aborta com um erro genérico; mostramos a mensagem certa.
    const erro = controle.signal.aborted ? new ErroImportacao(MENSAGEM_CANCELADO) : erroOriginal;
    const conhecido = erro instanceof ErroImportacao || erro instanceof ErroIa;
    if (!conhecido) console.error(`Falha ao importar ${trabalho.nomeArquivo}`, erro);
    await db
      .update(trabalhosImportacao)
      .set({
        status: "erro",
        // Mantém o arquivo em caso de erro inesperado, para poder tentar de novo.
        arquivo: conhecido ? null : trabalho.arquivo,
        senha: null,
        concluidoEm: new Date(),
        mensagem: conhecido
          ? (erro as Error).message
          : `Erro inesperado: ${erro instanceof Error ? erro.message : String(erro)}`.slice(0, 500),
      })
      .where(eq(trabalhosImportacao.id, trabalho.id));
  } finally {
    fila.atual = undefined;
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
      sql`${trabalhosImportacao.status} in ('fila','processando','senha') or ${trabalhosImportacao.concluidoEm} > now() - interval '30 minutes'`,
    )
    .orderBy(trabalhosImportacao.id);
  return linhas.map((l) => l.id);
}
