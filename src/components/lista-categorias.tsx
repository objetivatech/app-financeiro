import Link from "next/link";
import { Cartao } from "@/components/ui";
import { formatarMoeda } from "@/lib/formato";

export interface ItemCategoria {
  categoriaId: string | null;
  nome: string;
  totalCentavos: number;
}

/** Ranking de gastos por categoria: uma barra por categoria (mesma cor, comprimento = valor). */
export function ListaCategorias({ titulo, cor, linhas, mes, escopo }: { titulo: string; cor: "pf" | "pj"; linhas: ItemCategoria[]; mes: string; escopo: "PF" | "PJ" }) {
  const max = Math.max(1, ...linhas.map((l) => l.totalCentavos));
  const total = linhas.reduce((s, l) => s + l.totalCentavos, 0);
  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 ? (
        <p className="text-sm text-suave">Nada classificado ainda.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {linhas.slice(0, 10).map((l) => (
            <li key={l.categoriaId ?? "sem"} title={`${l.nome}: ${formatarMoeda(l.totalCentavos)}`}>
              <div className="flex justify-between gap-2">
                <span>{l.nome}</span>
                <span className="numero">
                  {formatarMoeda(l.totalCentavos)} <span className="text-xs text-suave">{total > 0 ? Math.round((l.totalCentavos / total) * 100) : 0}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-foreground/5">
                <div className={`h-1.5 rounded-full ${cor === "pf" ? "bg-pf" : "bg-pj"}`} style={{ width: `${(l.totalCentavos / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/transacoes?mes=${mes}&escopo=${escopo}`} className="mt-3 inline-block text-xs underline">
        ver transações
      </Link>
    </Cartao>
  );
}
