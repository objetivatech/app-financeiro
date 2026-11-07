import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { contasAPagar, saldosPorConta } from "../compromissos/servico";
import { listarAlertasAtivos } from "../consultor/alertas";
import { perguntarAoConsultor } from "../consultor/chat";
import { hojeBrasil, somarDias } from "../datas";
import type { Db } from "../db";
import { alertas, configuracoes } from "../db/schema";
import { impostosPorCompetencia } from "../fiscal/impostos-a-pagar";
import { iaDisponivel } from "../ia/cliente";
import { enfileirar, informarSenha, situacaoDosTrabalhos } from "../importacao/fila";
import { dadosConsolidado } from "../visoes/paineis";
import { baixarArquivo, chamar, digitando, enviar, ErroTelegram, telegramConfigurado, type Atualizacao, type Mensagem } from "./api";
import { AJUDA, esc, markdownParaTelegram, textoAPagar, textoAvisos, textoBomDia, textoImpostos, textoResumo, textoSaldos } from "./textos";

/**
 * Bot do Telegram: só conversa com o chat vinculado (código gerado em Configurações). Comandos de
 * consulta, envio de extratos/faturas para a fila de importação, perguntas ao consultor e avisos
 * (bom dia com o que vence; avisos críticos assim que aparecem). Só lê e importa: não paga nada.
 */

const CHAVE = "telegram";
const VALIDADE_CODIGO_MS = 15 * 60_000;
const HORA_BOM_DIA = 8;

export interface EstadoTelegram {
  chatId?: number | null;
  nome?: string | null;
  vinculadoEm?: string | null;
  codigo?: { valor: string; geradoEm: string } | null;
  offset?: number;
  /** Conversa do consultor usada pelo Telegram (mantém o contexto entre perguntas). */
  conversaId?: number | null;
  /** Arquivos enviados pelo Telegram que ainda estão na fila. */
  arquivos?: { trabalhoId: number; nome: string }[];
  /** Arquivo com senha esperando a próxima mensagem (a senha). */
  aguardandoSenha?: number | null;
  ultimoBomDia?: string | null;
  /** Avisos críticos já enviados (ids). */
  avisosEnviados?: number[];
}

export async function lerEstado(db: Db): Promise<EstadoTelegram> {
  const linha = await db.query.configuracoes.findFirst({ where: eq(configuracoes.chave, CHAVE) });
  return (linha?.valor as EstadoTelegram | undefined) ?? {};
}

/**
 * Grava só os campos mudados, mesclando no banco (jsonb ||): o laço do bot, as rotinas e a tela de
 * Configurações gravam em paralelo e um não pode apagar o que o outro acabou de salvar.
 */
async function salvarEstado(db: Db, mudancas: Partial<EstadoTelegram>): Promise<void> {
  const parcial = JSON.stringify(mudancas);
  await db
    .insert(configuracoes)
    .values({ chave: CHAVE, valor: mudancas })
    .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: sql`${configuracoes.valor} || ${parcial}::jsonb`, atualizadoEm: new Date() } });
}

/** Código de 6 dígitos para vincular o seu chat (mostrado em Configurações, vale 15 minutos). */
export async function gerarCodigoDeVinculo(db: Db): Promise<string> {
  const valor = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await salvarEstado(db, { codigo: { valor, geradoEm: new Date().toISOString() } });
  return valor;
}

export async function desvincular(db: Db): Promise<void> {
  await salvarEstado(db, { chatId: null, nome: null, vinculadoEm: null, conversaId: null, arquivos: [], aguardandoSenha: null });
}

/** Mensagem avulsa para o chat vinculado (ex.: teste em Configurações). */
export async function enviarParaVinculado(db: Db, html: string): Promise<boolean> {
  const { chatId } = await lerEstado(db);
  if (!chatId || !telegramConfigurado()) return false;
  await enviar(chatId, html);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------------------------

async function resumo(db: Db): Promise<string> {
  const mes = hojeBrasil().slice(0, 7);
  const d = await dadosConsolidado(db, mes);
  const avisos = await listarAlertasAtivos(db);
  return textoResumo({
    mes,
    resultado: d.atual.total.resultado,
    ficouNaEmpresa: d.atual.total.ficouNaEmpresa,
    sobrouParaVoce: d.atual.total.sobrouParaVoce,
    receitaPJ: d.atual.pj.receitaTotal,
    caixa: d.caixa,
    aReceber: d.aReceber,
    posicaoLiquida: d.posicaoLiquida,
    avisosAtivos: avisos.length,
  });
}

async function impostos(db: Db): Promise<string> {
  const lista = await impostosPorCompetencia(db, 2);
  const hoje = hojeBrasil();
  const passada = lista.find((c) => c.competencia < hoje.slice(0, 7) && c.vencimento >= hoje && !c.dasPago);
  const atual = lista.find((c) => c.competencia === hoje.slice(0, 7));
  return textoImpostos(
    passada ?? null,
    atual ? { competencia: atual.competencia, vencimento: atual.vencimento, total: (atual.dasCentavos ?? 0) + atual.inssCentavos } : null,
  );
}

const COMANDOS: Record<string, (db: Db) => Promise<string>> = {
  resumo,
  saldo: async (db) => textoSaldos(await saldosPorConta(db)),
  saldos: async (db) => textoSaldos(await saldosPorConta(db)),
  pagar: async (db) => textoAPagar((await contasAPagar(db, 7)).pendentes, hojeBrasil()),
  impostos,
  avisos: async (db) => textoAvisos(await listarAlertasAtivos(db)),
  ajuda: async () => AJUDA,
  start: async () => AJUDA,
};

/** Pergunta livre → consultor (IA com acesso aos dados), na mesma conversa do Telegram. */
async function perguntar(db: Db, chatId: number, pergunta: string, estado: EstadoTelegram): Promise<void> {
  if (!iaDisponivel()) {
    await enviar(chatId, "O consultor precisa da ANTHROPIC_API_KEY no servidor. Use os comandos: /ajuda");
    return;
  }
  await digitando(chatId);
  const pulso = setInterval(() => void digitando(chatId), 4500);
  let texto = "";
  let conversaId = estado.conversaId ?? null;
  try {
    await perguntarAoConsultor(db, { conversaId, pergunta }, (e) => {
      if (e.tipo === "inicio" && e.conversaId) conversaId = e.conversaId;
      if (e.tipo === "texto" && e.delta) texto += e.delta;
    });
  } finally {
    clearInterval(pulso);
  }
  if (conversaId !== estado.conversaId) await salvarEstado(db, { conversaId });
  await enviar(chatId, markdownParaTelegram(texto.trim() || "Não consegui responder agora. Tente de novo."));
}

/** Documento ou foto → fila de importação (o resultado chega numa mensagem quando terminar). */
async function receberArquivo(db: Db, chatId: number, msg: Mensagem, estado: EstadoTelegram): Promise<void> {
  const foto = msg.photo?.at(-1);
  const fileId = msg.document?.file_id ?? foto?.file_id;
  if (!fileId) return;
  const nome = msg.document?.file_name ?? `foto-${msg.date}.jpg`;
  if ((msg.document?.file_size ?? foto?.file_size ?? 0) > 20 * 1024 * 1024) {
    await enviar(chatId, "Arquivo maior que 20 MB: o Telegram não deixa o bot baixar. Envie pelo app (Importar).");
    return;
  }
  const bytes = await baixarArquivo(fileId);
  const trabalhoId = await enfileirar(db, bytes, nome);
  await salvarEstado(db, { arquivos: [...(estado.arquivos ?? []), { trabalhoId, nome }] });
  await enviar(chatId, `📥 Recebi <b>${esc(nome)}</b>. Estou lendo; aviso quando terminar.`);
}

/** Trata uma mensagem recebida. Exportado para os testes. */
export async function tratarMensagem(db: Db, msg: Mensagem): Promise<void> {
  const chatId = msg.chat.id;
  const estado = await lerEstado(db);
  const texto = (msg.text ?? "").trim();

  // Vínculo: só um chat conversa com o bot, e só depois de mandar o código mostrado no app.
  if (estado.chatId !== chatId) {
    const codigo = texto.match(/^\/(?:start|vincular)\s+(\d{6})$/)?.[1] ?? texto.match(/^(\d{6})$/)?.[1];
    const valido = estado.codigo && Date.now() - Date.parse(estado.codigo.geradoEm) < VALIDADE_CODIGO_MS;
    if (codigo && valido && codigo === estado.codigo!.valor) {
      await salvarEstado(db, { chatId, nome: msg.from?.first_name ?? msg.chat.first_name ?? null, vinculadoEm: new Date().toISOString(), codigo: null });
      await enviar(chatId, `✅ Vinculado! A partir de agora só respondo a este chat.\n\n${AJUDA}`);
    } else if (msg.chat.type === "private") {
      await enviar(chatId, "Este bot é privado. Para vincular, gere o código em Configurações → Telegram no app e envie: /vincular 123456");
    }
    return;
  }

  if (msg.document || msg.photo) {
    await receberArquivo(db, chatId, msg, estado);
    return;
  }
  if (!texto) return;

  // Resposta a "este PDF tem senha".
  if (estado.aguardandoSenha && !texto.startsWith("/")) {
    const id = estado.aguardandoSenha;
    await salvarEstado(db, { aguardandoSenha: null });
    const ok = await informarSenha(db, id, texto, true);
    await chamar("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => undefined); // não deixa a senha no chat
    await enviar(chatId, ok ? "🔑 Obrigado. Tentando abrir o arquivo…" : "Esse arquivo não está mais esperando senha.");
    return;
  }

  const comando = texto.match(/^\/([a-zA-Z]+)(?:@\w+)?/)?.[1]?.toLowerCase();
  if (comando) {
    const fn = COMANDOS[comando];
    if (comando === "cancelar") {
      await salvarEstado(db, { aguardandoSenha: null, conversaId: null });
      await enviar(chatId, "Ok. Começo uma conversa nova com o consultor na próxima pergunta.");
    } else await enviar(chatId, fn ? await fn(db) : `Não conheço /${esc(comando)}.\n\n${AJUDA}`);
    return;
  }
  await perguntar(db, chatId, texto, estado);
}

// ---------------------------------------------------------------------------------------------
// Rotinas: arquivos na fila, bom dia e avisos críticos
// ---------------------------------------------------------------------------------------------

/** Avisa o resultado dos arquivos mandados pelo Telegram (importado, erro ou pedindo senha). */
export async function acompanharArquivos(db: Db): Promise<void> {
  const estado = await lerEstado(db);
  if (!estado.chatId || !estado.arquivos?.length) return;
  const situacoes = await situacaoDosTrabalhos(db, estado.arquivos.map((a) => a.trabalhoId));
  const restantes: { trabalhoId: number; nome: string }[] = [];
  let aguardandoSenha = estado.aguardandoSenha ?? null;
  for (const a of estado.arquivos) {
    const s = situacoes.find((x) => x.id === a.trabalhoId);
    if (!s || s.status === "fila" || s.status === "processando") {
      if (s) restantes.push(a);
      continue;
    }
    if (s.status === "concluido" && s.resultado) {
      const r = s.resultado;
      await enviar(
        estado.chatId,
        `✅ <b>${esc(a.nome)}</b> importado: ${r.novas} transação(ões) nova(s) em ${esc(r.contaApelido)}${r.duplicadas ? ` (${r.duplicadas} já existiam)` : ""}.`,
      );
    } else if (s.status === "senha") {
      restantes.push(a);
      if (aguardandoSenha === a.trabalhoId) continue; // já perguntou
      aguardandoSenha = a.trabalhoId;
      await enviar(estado.chatId, `🔒 <b>${esc(a.nome)}</b>: ${esc(s.mensagem ?? "o PDF tem senha.")} Responda com a senha (apago a mensagem em seguida; ela fica guardada cifrada para os próximos).`);
    } else {
      await enviar(estado.chatId, `❌ <b>${esc(a.nome)}</b>: ${esc(s.mensagem ?? "não foi possível importar.")}`);
    }
  }
  await salvarEstado(db, { arquivos: restantes, aguardandoSenha });
}

/** Uma vez por dia, a partir das 8h: o que vence hoje e amanhã, e os atrasados. */
export async function bomDiaSeNecessario(db: Db, agora = new Date()): Promise<boolean> {
  const estado = await lerEstado(db);
  const hoje = hojeBrasil();
  const hora = Number(agora.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  if (!estado.chatId || estado.ultimoBomDia === hoje || hora < HORA_BOM_DIA) return false;
  await salvarEstado(db, { ultimoBomDia: hoje });
  const { pendentes } = await contasAPagar(db, 1);
  const vencendo = pendentes.filter((p) => p.vencimento === hoje || p.vencimento === somarDias(hoje, 1));
  const texto = textoBomDia(hoje, vencendo, pendentes.filter((p) => p.vencimento < hoje).length);
  if (texto) await enviar(estado.chatId, texto);
  return Boolean(texto);
}

/** Avisos críticos novos (ex.: caixa negativo previsto, dívida perto do limite de atraso) vão na hora. */
export async function enviarAvisosCriticos(db: Db): Promise<number> {
  const estado = await lerEstado(db);
  if (!estado.chatId) return 0;
  const enviados = new Set(estado.avisosEnviados ?? []);
  const criticos = await db
    .select()
    .from(alertas)
    .where(and(eq(alertas.status, "ativo"), eq(alertas.gravidade, "critico"), gt(alertas.criadoEm, new Date(Date.now() - 3 * 86_400_000))));
  const novos = criticos.filter((a) => !enviados.has(a.id));
  if (novos.length) await enviar(estado.chatId, textoAvisos(novos).replace("Avisos do consultor", "Aviso urgente"));
  // Guarda só os ids ainda ativos (a lista não cresce para sempre).
  const ativos = new Set((await db.select({ id: alertas.id }).from(alertas).where(inArray(alertas.id, [...enviados, ...novos.map((a) => a.id), -1]))).map((a) => a.id));
  await salvarEstado(db, { avisosEnviados: [...ativos] });
  return novos.length;
}

// ---------------------------------------------------------------------------------------------
// Laço de leitura (long polling)
// ---------------------------------------------------------------------------------------------

const global_ = globalThis as unknown as { __botTelegram?: { rodando: boolean; parar?: AbortController } };

/** Processa uma rodada de mensagens. Exportado para os testes. */
export async function rodada(db: Db, timeoutSegundos = 50, signal?: AbortSignal): Promise<number> {
  const estado = await lerEstado(db);
  const atualizacoes = await chamar<Atualizacao[]>("getUpdates", { offset: estado.offset ?? 0, timeout: timeoutSegundos, allowed_updates: ["message"] }, signal);
  for (const a of atualizacoes) {
    // Avança o offset antes de tratar: uma mensagem que derruba o tratamento não fica em loop.
    await salvarEstado(db, { offset: a.update_id + 1 });
    if (!a.message) continue;
    try {
      await tratarMensagem(db, a.message);
    } catch (erro) {
      console.error("Bot do Telegram: falha ao tratar mensagem", erro instanceof Error ? erro.message : erro);
      await enviar(a.message.chat.id, "Algo deu errado aqui. Tente de novo em instantes.").catch(() => undefined);
    }
  }
  return atualizacoes.length;
}

/** Liga o bot (uma vez por processo). Sem TELEGRAM_BOT_TOKEN, não faz nada. */
export function iniciarBot(db: Db): void {
  if (!telegramConfigurado() || global_.__botTelegram?.rodando) return;
  const controle = new AbortController();
  global_.__botTelegram = { rodando: true, parar: controle };
  void (async () => {
    // Sem webhook: o bot busca as mensagens (o app fica atrás do Cloudflare Access).
    await chamar("deleteWebhook", {}).catch(() => undefined);
    let espera = 1000;
    while (!controle.signal.aborted) {
      try {
        await rodada(db, 50, controle.signal);
        await acompanharArquivos(db);
        espera = 1000;
      } catch (erro) {
        if (controle.signal.aborted) break;
        const codigo = erro instanceof ErroTelegram ? erro.codigo : undefined;
        console.error("Bot do Telegram:", erro instanceof Error ? erro.message : erro);
        // 401: token errado; 409: outro processo usando o mesmo bot. Espera mais antes de tentar de novo.
        espera = Math.min(codigo === 401 || codigo === 409 ? 5 * 60_000 : espera * 2, 5 * 60_000);
        await new Promise((r) => setTimeout(r, espera));
      }
    }
  })();
  // Rotinas de aviso (a cada minuto; cada uma decide se é hora).
  const rotinas = setInterval(() => {
    void acompanharArquivos(db).catch(() => undefined);
    void bomDiaSeNecessario(db).catch((e) => console.error("Bot do Telegram (bom dia):", e));
    void enviarAvisosCriticos(db).catch((e) => console.error("Bot do Telegram (avisos):", e));
  }, 60_000);
  rotinas.unref();
}

export function botAtivo(): boolean {
  return Boolean(global_.__botTelegram?.rodando);
}
