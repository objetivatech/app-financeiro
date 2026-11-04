import type Anthropic from "@anthropic-ai/sdk";
import { asc, desc, eq } from "drizzle-orm";
import { obterPerfil } from "../classificacao/executar";
import { hojeBrasil } from "../datas";
import type { Db } from "../db";
import { conversas, mensagensConsultor } from "../db/schema";
import { ErroIa, modeloDa, obterClienteIa, opcoesDeFallback, registrarUso } from "../ia/cliente";
import { ferramentasDoConsultor, ROTULOS_FERRAMENTAS } from "./ferramentas";
import { SKILL_GESTAO_FINANCEIRA } from "./skill";

/**
 * Prompt de sistema do consultor. É sempre igual (a data e o perfil vão num bloco à parte, depois
 * do ponto de cache), para o cache do prompt funcionar entre perguntas.
 */
const SISTEMA = `Você é o consultor financeiro do app "Financeiro PF + PJ": acompanha a vida financeira pessoal (PF) e a empresa (PJ, Simples Nacional, serviços de marketing/SEO) do usuário, um sócio com dependentes.

Você tem ferramentas que consultam os dados reais do app e fazem simulações. Regras:
- Antes de afirmar qualquer número, consulte a ferramenta certa (comece pelo panorama_do_mes). Nunca invente valores; se faltar dado (ex.: extrato não importado), diga o que falta.
- Para "e se" (carro, pró-labore, quitar dívida, juntar dinheiro), use as ferramentas de simulação em vez de calcular de cabeça.
- Siga a skill abaixo: prioridades, referências e jeito de agir.
- Responda em português do Brasil, curto e direto, em Markdown simples (parágrafos, listas, no máximo uma tabela pequena). Valores em R$.
- Termine com "**O que fazer agora**" e 1 a 3 ações concretas, em ordem de prioridade.
- Temas tributários e societários: explique o raciocínio e sugira a pergunta para a contabilidade.

${SKILL_GESTAO_FINANCEIRA}`;

export interface EventoConsultor {
  tipo: "inicio" | "texto" | "ferramenta" | "fim" | "erro";
  conversaId?: number;
  delta?: string;
  nome?: string;
  mensagem?: string;
}

/** Quantas mensagens anteriores vão como contexto (o resto da conversa fica só no banco). */
const HISTORICO = 16;

export async function listarConversas(db: Db) {
  return db.select().from(conversas).orderBy(desc(conversas.atualizadoEm)).limit(30);
}

export async function mensagensDaConversa(db: Db, conversaId: number) {
  return db.select().from(mensagensConsultor).where(eq(mensagensConsultor.conversaId, conversaId)).orderBy(asc(mensagensConsultor.id));
}

export async function excluirConversa(db: Db, conversaId: number) {
  await db.delete(conversas).where(eq(conversas.id, conversaId));
}

/**
 * Responde uma pergunta: grava a pergunta, chama o modelo com as ferramentas (o SDK conduz o ciclo
 * pergunta → ferramenta → resposta) e vai repassando o texto conforme chega.
 */
export async function perguntarAoConsultor(
  db: Db,
  entrada: { conversaId?: number | null; pergunta: string; signal?: AbortSignal },
  emitir: (e: EventoConsultor) => void,
): Promise<void> {
  const pergunta = entrada.pergunta.trim().slice(0, 4000);
  if (!pergunta) throw new ErroIa("Escreva uma pergunta.");

  let conversaId = entrada.conversaId ?? null;
  if (conversaId) {
    const existe = await db.query.conversas.findFirst({ where: eq(conversas.id, conversaId) });
    if (!existe) conversaId = null;
  }
  if (!conversaId) {
    const [nova] = await db
      .insert(conversas)
      .values({ titulo: pergunta.length > 70 ? `${pergunta.slice(0, 67)}…` : pergunta })
      .returning({ id: conversas.id });
    conversaId = nova.id;
  }
  emitir({ tipo: "inicio", conversaId });

  const anteriores = (await mensagensDaConversa(db, conversaId)).slice(-HISTORICO);
  await db.insert(mensagensConsultor).values({ conversaId, papel: "usuario", texto: pergunta });

  // Só o texto das mensagens anteriores volta como contexto: as consultas são refeitas se preciso
  // (os números mudam com novas importações).
  const historico: Anthropic.Beta.BetaMessageParam[] = anteriores.map((m) => ({
    role: m.papel === "usuario" ? ("user" as const) : ("assistant" as const),
    content: m.texto,
  }));
  if (historico[0]?.role === "assistant") historico.shift();
  historico.push({ role: "user", content: pergunta });

  const perfil = await obterPerfil(db);
  const modelo = modeloDa("consultor");
  const cliente = obterClienteIa();
  const runner = cliente.beta.messages.toolRunner(
    {
      model: modelo,
      max_tokens: 16000,
      max_iterations: 10,
      stream: true,
      ...opcoesDeFallback(modelo),
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Hoje é ${hojeBrasil()}.${perfil ? `\nSobre o usuário e a empresa (escrito por ele): ${perfil}` : ""}` },
      ],
      tools: ferramentasDoConsultor(db),
      messages: historico,
    },
    { signal: entrada.signal },
  );

  const partes: string[] = [];
  const usadas: string[] = [];
  for await (const stream of runner) {
    let textoDaVolta = "";
    stream.on("text", (delta) => {
      textoDaVolta += delta;
      emitir({ tipo: "texto", delta });
    });
    const mensagem = await stream.finalMessage();
    await registrarUso("consultor", mensagem.model ?? modelo, mensagem.usage);
    if (mensagem.stop_reason === "refusal") throw new ErroIa("O consultor não pôde responder a esta pergunta. Tente reformular.");
    for (const bloco of mensagem.content) {
      if (bloco.type === "tool_use") {
        const rotulo = ROTULOS_FERRAMENTAS[bloco.name] ?? bloco.name;
        usadas.push(rotulo);
        emitir({ tipo: "ferramenta", nome: rotulo });
      }
    }
    if (textoDaVolta.trim()) partes.push(textoDaVolta.trim());
  }

  const resposta = partes.join("\n\n") || "Não consegui montar uma resposta. Tente perguntar de outro jeito.";
  await db.insert(mensagensConsultor).values({ conversaId, papel: "consultor", texto: resposta, ferramentas: [...new Set(usadas)] });
  await db.update(conversas).set({ atualizadoEm: new Date() }).where(eq(conversas.id, conversaId));
  emitir({ tipo: "fim", conversaId });
}
