"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markdownSeguro } from "@/lib/markdown";

export interface MensagemChat {
  papel: "usuario" | "consultor";
  texto: string;
  ferramentas?: string[];
}

const SUGESTOES = [
  "Como está minha situação este mês?",
  "Consigo trocar de carro (usado de R$ 25 mil, vendendo o atual para a entrada)?",
  "Qual dívida devo quitar primeiro e quanto economizo antecipando?",
  "Vale a pena mudar o pró-labore por causa do Fator R?",
  "Quanto preciso guardar por mês para ter 6 meses de reserva?",
  "Onde estou gastando mais do que deveria?",
];

export function Chat({ conversaId: inicial, mensagens: iniciais, perguntaInicial }: { conversaId: number | null; mensagens: MensagemChat[]; perguntaInicial: string }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<MensagemChat[]>(iniciais);
  const [conversaId, setConversaId] = useState<number | null>(inicial);
  const [texto, setTexto] = useState(perguntaInicial);
  const [respondendo, setRespondendo] = useState(false);
  const [consultando, setConsultando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, consultando]);

  async function enviar(pergunta: string) {
    if (!pergunta.trim() || respondendo) return;
    setErro(null);
    setTexto("");
    setRespondendo(true);
    setConsultando([]);
    setMensagens((m) => [...m, { papel: "usuario", texto: pergunta }, { papel: "consultor", texto: "", ferramentas: [] }]);
    const controle = new AbortController();
    cancelar.current = controle;
    let idConversa = conversaId;
    try {
      const resposta = await fetch("/api/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta, conversaId }),
        signal: controle.signal,
      });
      if (!resposta.ok || !resposta.body) {
        const j = (await resposta.json().catch(() => ({}))) as { erro?: string };
        throw new Error(j.erro ?? "Não foi possível falar com o consultor.");
      }
      const leitor = resposta.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const e = JSON.parse(linha) as { tipo: string; delta?: string; nome?: string; conversaId?: number; mensagem?: string };
          if (e.tipo === "inicio" && e.conversaId) {
            idConversa = e.conversaId;
            setConversaId(e.conversaId);
          } else if (e.tipo === "texto" && e.delta) {
            setMensagens((m) => {
              const ultima = m[m.length - 1];
              return [...m.slice(0, -1), { ...ultima, texto: ultima.texto + e.delta }];
            });
          } else if (e.tipo === "ferramenta" && e.nome) {
            setConsultando((c) => [...c, e.nome!]);
            setMensagens((m) => {
              const ultima = m[m.length - 1];
              // Texto antes de uma consulta é só preparação: separa do que vem depois.
              return [...m.slice(0, -1), { ...ultima, texto: ultima.texto ? `${ultima.texto}\n\n` : "", ferramentas: [...(ultima.ferramentas ?? []), e.nome!] }];
            });
          } else if (e.tipo === "erro") {
            throw new Error(e.mensagem ?? "Falha ao responder.");
          }
        }
      }
      if (idConversa && idConversa !== inicial) router.replace(`/consultor?c=${idConversa}`, { scroll: false });
      router.refresh();
    } catch (falha) {
      if (!controle.signal.aborted) setErro(falha instanceof Error ? falha.message : "Falha ao responder.");
      setMensagens((m) => (m[m.length - 1]?.texto ? m : m.slice(0, -1)));
    } finally {
      setRespondendo(false);
      setConsultando([]);
      cancelar.current = null;
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4">
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-suave">
              Pergunte sobre a sua situação, peça uma simulação ou traga uma decisão. O consultor consulta os seus dados (sem CPF/CNPJ)
              e responde com números e próximos passos.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="rounded-full border border-borda bg-superficie px-3 py-1.5 text-left text-sm hover:border-foreground/30">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) =>
          m.papel === "usuario" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-foreground px-4 py-2 text-sm text-background">
              {m.texto}
            </div>
          ) : (
            <div key={i} className="max-w-[95%] rounded-2xl rounded-bl-sm border border-borda bg-superficie px-4 py-3 text-sm">
              {m.texto ? (
                <div className="manual resposta-consultor" dangerouslySetInnerHTML={{ __html: markdownSeguro(m.texto) }} />
              ) : (
                <p className="text-suave">{respondendo && i === mensagens.length - 1 ? (consultando.length ? `Consultando: ${consultando.at(-1)}…` : "Pensando…") : ""}</p>
              )}
              {m.ferramentas && m.ferramentas.length > 0 && (
                <p className="mt-2 border-t border-borda pt-1.5 text-xs text-suave">Consultou: {[...new Set(m.ferramentas)].join(", ")}</p>
              )}
            </div>
          ),
        )}
        {erro && <p className="text-sm text-negativo">{erro}</p>}
        <div ref={fim} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
        className="sticky bottom-0 mt-4 flex gap-2 bg-background py-3"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(texto);
            }
          }}
          rows={2}
          placeholder="Pergunte ao consultor…"
          aria-label="Sua pergunta"
          className="min-h-[2.75rem] flex-1 resize-y rounded-md border border-borda bg-superficie px-3 py-2 text-sm"
          disabled={respondendo}
        />
        {respondendo ? (
          <button type="button" onClick={() => cancelar.current?.abort()} className="rounded-md border border-borda px-3 text-sm">
            Parar
          </button>
        ) : (
          <button type="submit" className="rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50" disabled={!texto.trim()}>
            Enviar
          </button>
        )}
      </form>
    </div>
  );
}
