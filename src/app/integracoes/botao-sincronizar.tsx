"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Botao } from "@/components/ui";
import { sincronizarAsaasAgora } from "./acoes";

export function BotaoSincronizar({ sincronizando, desativado }: { sincronizando: boolean; desativado: boolean }) {
  const [estado, acao, pendente] = useActionState(sincronizarAsaasAgora, null);
  const router = useRouter();
  // Enquanto sincroniza, recarrega a página a cada 3 s para mostrar o andamento.
  useEffect(() => {
    if (!sincronizando) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [sincronizando, router]);

  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <Botao type="submit" disabled={desativado || pendente || sincronizando}>
        {sincronizando ? "Sincronizando…" : "Sincronizar agora"}
      </Botao>
      {estado?.erro && <span className="text-sm text-negativo">{estado.erro}</span>}
    </form>
  );
}
