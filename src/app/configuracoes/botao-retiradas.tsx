"use client";

import { useState, useTransition } from "react";
import { procurarRetiradas } from "./acoes";

export function BotaoRetiradas() {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => iniciar(async () => setMsg((await procurarRetiradas()).ok))}
        disabled={pendente}
        className="rounded-md border border-borda px-3 py-1.5 text-sm hover:border-foreground/30 disabled:opacity-50"
      >
        {pendente ? "Procurando…" : "Procurar retiradas nas transações"}
      </button>
      {msg && <span className="text-xs text-suave">{msg}</span>}
    </span>
  );
}
