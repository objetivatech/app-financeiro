import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LinkAjuda } from "@/components/link-ajuda";
import { Carregando } from "@/components/ui";
import { listarConversas, mensagensDaConversa } from "@/lib/consultor/chat";
import { SKILL_GESTAO_FINANCEIRA } from "@/lib/consultor/skill";
import { obterDb } from "@/lib/db";
import { iaDisponivel, modeloDa } from "@/lib/ia/cliente";
import { markdownSeguro } from "@/lib/markdown";
import { apagarConversa } from "./acoes";
import { Chat } from "./chat";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaConsultor({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">
          Consultor <LinkAjuda secao="consultor" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Converse sobre as suas finanças e as da empresa. O consultor consulta os dados do app, faz simulações e segue a skill de
          gestão financeira.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const sp = await searchParams;
  const db = obterDb();
  const pedida = Number(typeof sp.c === "string" ? sp.c : "") || null;
  const pergunta = typeof sp.pergunta === "string" ? sp.pergunta.slice(0, 1000) : "";
  const [lista, mensagens] = await Promise.all([listarConversas(db), pedida ? mensagensDaConversa(db, pedida) : Promise.resolve([])]);
  const conversaId = pedida && lista.some((c) => c.id === pedida) ? pedida : null;

  if (!iaDisponivel()) {
    return <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">Configure a ANTHROPIC_API_KEY para conversar com o consultor. Os avisos automáticos funcionam sem ela.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
      <aside className="space-y-3 text-sm lg:order-none">
        <Link href="/consultor" className="block rounded-md border border-borda bg-superficie px-3 py-2 text-center hover:border-foreground/30">
          + Nova conversa
        </Link>
        {lista.length > 0 && (
          <details open className="lg:open">
            <summary className="cursor-pointer text-xs text-suave">Conversas anteriores</summary>
            <ul className="mt-2 space-y-1">
              {lista.map((c) => (
                <li key={c.id} className={`group flex items-start justify-between gap-1 rounded-md px-2 py-1 ${c.id === conversaId ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"}`}>
                  <Link href={`/consultor?c=${c.id}`} className="line-clamp-2 flex-1">
                    {c.titulo}
                  </Link>
                  <form action={apagarConversa}>
                    <input type="hidden" name="id" value={c.id} />
                    <button title="Apagar conversa" aria-label="Apagar conversa" className="text-xs text-suave opacity-60 hover:text-negativo group-hover:opacity-100">
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-suave">Como o consultor pensa</summary>
          <div className="manual mt-2 max-h-96 overflow-y-auto text-xs" dangerouslySetInnerHTML={{ __html: markdownSeguro(SKILL_GESTAO_FINANCEIRA) }} />
        </details>
        <p className="text-xs text-suave">Modelo: {modeloDa("consultor")}. O custo aparece em Configurações → Inteligência artificial.</p>
      </aside>
      <section>
        <Chat
          key={conversaId ?? "nova"}
          conversaId={conversaId}
          mensagens={mensagens.map((m) => ({ papel: m.papel, texto: m.texto, ferramentas: m.ferramentas }))}
          perguntaInicial={pergunta}
        />
      </section>
    </div>
  );
}
