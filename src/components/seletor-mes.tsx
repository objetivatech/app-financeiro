import Link from "next/link";
import { deslocarMes, formatarMes } from "@/lib/formato";

/** Navegação ← mês anterior | próximo mês →, mantendo a página. */
export function SeletorMes({ caminho, mes }: { caminho: string; mes: string }) {
  const anterior = deslocarMes(mes, -1);
  const proximo = deslocarMes(mes, 1);
  return (
    <div className="flex gap-3 text-sm">
      <Link href={`${caminho}?mes=${anterior}`} className="underline">
        ← {formatarMes(anterior)}
      </Link>
      <Link href={`${caminho}?mes=${proximo}`} className="underline">
        {formatarMes(proximo)} →
      </Link>
    </div>
  );
}
