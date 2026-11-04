import { BotaoEnviar, Formulario } from "@/components/formulario";
import Link from "next/link";
import type { Alerta } from "@/lib/db/schema";
import { adiarAviso, dispensarAviso } from "@/app/avisos/acoes";

const ESTILO = {
  critico: { borda: "border-negativo/50 bg-negativo/[0.07]", rotulo: "Urgente", icone: "⚠", cor: "text-negativo" },
  atencao: { borda: "border-alerta/40 bg-alerta/[0.07]", rotulo: "Atenção", icone: "!", cor: "text-alerta" },
  info: { borda: "border-borda bg-superficie", rotulo: "Dica", icone: "i", cor: "text-suave" },
} as const;

export function linkConsultor(pergunta: string): string {
  return `/consultor?pergunta=${encodeURIComponent(pergunta)}`;
}

/** Selo da gravidade: ícone + palavra (a cor nunca é a única pista). */
export function SeloGravidade({ gravidade }: { gravidade: Alerta["gravidade"] }) {
  const e = ESTILO[gravidade];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide ${e.cor}`}>
      <span aria-hidden>{e.icone}</span>
      {e.rotulo}
    </span>
  );
}

/** Um aviso completo: o que está acontecendo, o que fazer e as ações. */
export function CartaoAviso({ a, compacto = false, acoes = true }: { a: Alerta; compacto?: boolean; acoes?: boolean }) {
  const e = ESTILO[a.gravidade];
  return (
    <article className={`rounded-lg border p-3 text-sm ${e.borda}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SeloGravidade gravidade={a.gravidade} />
        {a.escopo && <span className={`text-xs ${a.escopo === "PF" ? "text-pf" : "text-pj"}`}>{a.escopo}</span>}
      </div>
      <h3 className="mt-1 font-medium">{a.titulo}</h3>
      <p className="mt-0.5 whitespace-pre-line text-suave">{a.mensagem}</p>
      {a.recomendacao && !compacto && (
        <p className="mt-2 whitespace-pre-line">
          <span className="font-medium">O que fazer: </span>
          {a.recomendacao}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {a.link && (
          <Link href={a.link} className="underline">
            resolver
          </Link>
        )}
        {a.pergunta && (
          <Link href={linkConsultor(a.pergunta)} className="underline">
            perguntar ao consultor
          </Link>
        )}
        {acoes && (
          <>
            <Formulario acao={adiarAviso} mensagemOk={null} retornoEmLinha>
              <input type="hidden" name="id" value={a.id} />
              <BotaoEnviar variante="link" pendente="adiando…" className="text-suave hover:text-foreground">
                lembrar em 7 dias
              </BotaoEnviar>
            </Formulario>
            <Formulario acao={dispensarAviso} mensagemOk={null} retornoEmLinha>
              <input type="hidden" name="id" value={a.id} />
              <BotaoEnviar variante="link" pendente="salvando…" className="text-suave hover:text-foreground" title="Esta situação não volta a gerar aviso">
                já resolvi / não mostrar
              </BotaoEnviar>
            </Formulario>
          </>
        )}
      </div>
    </article>
  );
}
