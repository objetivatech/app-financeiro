"use client";

import { useState, useTransition } from "react";
import { gerarCartaAgora } from "./acoes";

/** Pede à IA a carta da semana agora (normalmente ela chega sozinha toda semana). */
export function BotaoCarta() {
  const [pendente, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ erro?: string; ok?: string } | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => iniciar(async () => setEstado(await gerarCartaAgora()))}
        disabled={pendente}
        className="rounded-md border border-borda px-3 py-1.5 text-sm hover:border-foreground/30 disabled:opacity-50"
      >
        {pendente ? "Escrevendo a carta…" : "Carta da semana agora"}
      </button>
      {estado && <span className={`text-xs ${estado.erro ? "text-negativo" : "text-positivo"}`}>{estado.erro ?? estado.ok}</span>}
    </div>
  );
}
