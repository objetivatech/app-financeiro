"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui";
import { gerarAnaliseDoMes } from "./acoes";

export function BotaoAnalise({ mes, temAnalise }: { mes: string; temAnalise: boolean }) {
  const [estado, acao, pendente] = useActionState(gerarAnaliseDoMes, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="mes" value={mes} />
      <Botao type="submit" disabled={pendente}>
        {pendente ? "Analisando… (pode levar 1 minuto)" : temAnalise ? "Gerar nova análise" : "Gerar análise com IA"}
      </Botao>
      {estado?.erro && <span className="text-sm text-negativo">{estado.erro}</span>}
    </form>
  );
}
