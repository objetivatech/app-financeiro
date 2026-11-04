"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { marcarAvisosVistos } from "@/app/avisos/acoes";

export interface AvisoJanela {
  id: number;
  gravidade: "info" | "atencao" | "critico";
  titulo: string;
  mensagem: string;
  recomendacao: string | null;
  link: string | null;
  pergunta: string | null;
}

/**
 * Janela que abre sozinha quando há aviso novo urgente ou de atenção. "Entendi" marca como visto
 * (o aviso continua na Central de avisos até a situação se resolver).
 */
export function JanelaAvisos({ avisos }: { avisos: AvisoJanela[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aberta, setAberta] = useState(avisos.length > 0);
  useEffect(() => {
    if (aberta && ref.current && !ref.current.open) ref.current.showModal();
  }, [aberta]);
  if (avisos.length === 0) return null;
  const fechar = () => {
    void marcarAvisosVistos(avisos.map((a) => a.id));
    ref.current?.close();
    setAberta(false);
  };
  return (
    <dialog
      ref={ref}
      onCancel={fechar}
      aria-labelledby="titulo-janela-avisos"
      className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-borda bg-superficie p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="max-h-[80vh] overflow-y-auto p-5">
        <h2 id="titulo-janela-avisos" className="text-lg font-semibold">
          O consultor tem {avisos.length === 1 ? "um aviso" : `${avisos.length} avisos`} para você
        </h2>
        <ul className="mt-4 space-y-3">
          {avisos.map((a) => (
            <li
              key={a.id}
              className={`rounded-lg border p-3 text-sm ${a.gravidade === "critico" ? "border-negativo/50 bg-negativo/[0.07]" : a.gravidade === "atencao" ? "border-alerta/40 bg-alerta/[0.07]" : "border-borda"}`}
            >
              <div className={`text-[11px] font-medium uppercase tracking-wide ${a.gravidade === "critico" ? "text-negativo" : a.gravidade === "atencao" ? "text-alerta" : "text-suave"}`}>
                {a.gravidade === "critico" ? "⚠ Urgente" : a.gravidade === "atencao" ? "! Atenção" : "✉ Do consultor"}
              </div>
              <div className="mt-1 font-medium">{a.titulo}</div>
              <p className="mt-0.5 whitespace-pre-line text-suave">{a.mensagem}</p>
              {a.recomendacao && (
                <p className="mt-1.5 whitespace-pre-line">
                  <span className="font-medium">O que fazer: </span>
                  {a.recomendacao}
                </p>
              )}
              <div className="mt-2 flex gap-4 text-xs">
                {a.link && (
                  <Link href={a.link} onClick={fechar} className="underline">
                    resolver
                  </Link>
                )}
                {a.pergunta && (
                  <Link href={`/consultor?pergunta=${encodeURIComponent(a.pergunta)}`} onClick={fechar} className="underline">
                    perguntar ao consultor
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Link href="/avisos" onClick={fechar} className="rounded-md border border-borda px-3 py-1.5 text-sm">
            Ver todos os avisos
          </Link>
          <button onClick={fechar} className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background" autoFocus>
            Entendi
          </button>
        </div>
      </div>
    </dialog>
  );
}
