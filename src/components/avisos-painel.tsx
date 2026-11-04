import Link from "next/link";
import { connection } from "next/server";
import { CartaoAviso } from "@/components/aviso";
import { atualizarAlertasSeNecessario, listarAlertasAtivos } from "@/lib/consultor/alertas";
import { obterDb } from "@/lib/db";

/** "O consultor diz": os avisos mais importantes do escopo, no topo de cada painel. */
export async function AvisosDoPainel({ escopo, limite = 3 }: { escopo?: "PF" | "PJ"; limite?: number }) {
  await connection();
  const db = obterDb();
  await atualizarAlertasSeNecessario(db);
  const lista = await listarAlertasAtivos(db, { escopo, limite: limite + 1 });
  if (lista.length === 0) return null;
  const mostrar = lista.slice(0, limite);
  return (
    <section aria-label="Avisos do consultor" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-suave">O consultor está de olho</h2>
        <Link href="/avisos" className="text-xs underline">
          todos os avisos
        </Link>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {mostrar.map((a) => (
          <CartaoAviso key={a.id} a={a} compacto acoes={false} />
        ))}
      </div>
    </section>
  );
}
