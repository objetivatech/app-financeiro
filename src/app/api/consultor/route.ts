import { perguntarAoConsultor, type EventoConsultor } from "@/lib/consultor/chat";
import { obterDb } from "@/lib/db";
import { iaDisponivel } from "@/lib/ia/cliente";

/**
 * Pergunta ao consultor. Responde em streaming (uma linha JSON por evento: início, texto,
 * ferramenta usada, fim ou erro), para o texto aparecer enquanto é escrito. Um "ping" a cada 15 s
 * mantém a conexão viva atrás da Cloudflare enquanto o consultor consulta os dados.
 */
export async function POST(request: Request) {
  if (!iaDisponivel()) return Response.json({ erro: "Configure a ANTHROPIC_API_KEY para usar o consultor." }, { status: 503 });
  const corpo = (await request.json().catch(() => ({}))) as { pergunta?: unknown; conversaId?: unknown };
  const pergunta = typeof corpo.pergunta === "string" ? corpo.pergunta : "";
  const conversaId = typeof corpo.conversaId === "number" ? corpo.conversaId : null;
  if (!pergunta.trim()) return Response.json({ erro: "Escreva uma pergunta." }, { status: 400 });

  const codificador = new TextEncoder();
  const fluxo = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (e: EventoConsultor | { tipo: "ping" }) => {
        try {
          controle.enqueue(codificador.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // conexão já fechada
        }
      };
      const ping = setInterval(() => enviar({ tipo: "ping" }), 15_000);
      try {
        await perguntarAoConsultor(obterDb(), { pergunta, conversaId, signal: request.signal }, enviar);
      } catch (erro) {
        if (!request.signal.aborted) {
          console.error("Consultor falhou", erro);
          enviar({ tipo: "erro", mensagem: erro instanceof Error ? erro.message : "Falha ao responder." });
        }
      } finally {
        clearInterval(ping);
        try {
          controle.close();
        } catch {
          // já fechado
        }
      }
    },
  });
  return new Response(fluxo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
