import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Botao, Cartao, Carregando, estiloCampo, SeloEscopo, Valor } from "@/components/ui";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import { listarContas, listarTransacoes, periodoDoMes } from "@/lib/consultas";
import { obterDb } from "@/lib/db";
import { formatarData, ROTULOS_NATUREZA } from "@/lib/formato";
import { iaDisponivel } from "@/lib/ia/cliente";
import { reclassificarComIa } from "./acoes";
import { LinhaTransacao } from "./linha";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaTransacoes({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transações</h1>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const mes = /^\d{4}-\d{2}$/.test(texto("mes")) ? texto("mes") : "";
  const contaId = Number(texto("conta")) || undefined;
  const escopo = ["PF", "PJ", "sem"].includes(texto("escopo")) ? (texto("escopo") as "PF" | "PJ" | "sem") : undefined;
  const revisar = texto("revisar") === "1";
  const busca = texto("q");

  const db = obterDb();
  const [lista, contas] = await Promise.all([
    listarTransacoes(db, { periodo: mes ? periodoDoMes(mes) : undefined, contaId, escopo, revisar, busca: busca || undefined }),
    listarContas(db),
  ]);
  const pendentesSemCategoria = lista.filter((t) => !t.categoriaId).length;

  return (
    <>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-suave">Mês</span>
          <input type="month" name="mes" defaultValue={mes} className={estiloCampo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-suave">Conta</span>
          <select name="conta" defaultValue={contaId ?? ""} className={estiloCampo}>
            <option value="">Todas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-suave">Escopo</span>
          <select name="escopo" defaultValue={escopo ?? ""} className={estiloCampo}>
            <option value="">PF e PJ</option>
            <option value="PF">Só PF</option>
            <option value="PJ">Só PJ</option>
            <option value="sem">Sem escopo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-suave">Descrição</span>
          <input type="search" name="q" defaultValue={busca} placeholder="ex.: ifood" className={estiloCampo} />
        </label>
        <label className="flex items-center gap-1.5 pb-2">
          <input type="checkbox" name="revisar" value="1" defaultChecked={revisar} /> Só para revisar
        </label>
        <Botao type="submit">Filtrar</Botao>
        <Link href="/transacoes" className="pb-2 text-suave underline">
          limpar
        </Link>
      </form>

      {pendentesSemCategoria > 0 && iaDisponivel() && (
        <form action={reclassificarComIa} className="flex items-center gap-3 text-sm">
          <span className="text-suave">{pendentesSemCategoria} transação(ões) sem categoria nesta lista.</span>
          <Botao type="submit">Classificar com IA</Botao>
        </form>
      )}

      <Cartao className="overflow-x-auto p-0">
        {lista.length === 0 ? (
          <p className="p-4 text-sm text-suave">
            Nenhuma transação encontrada. <Link href="/importar" className="underline">Importe um extrato</Link>.
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-suave">
              <tr className="border-b border-borda">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium">Classificação</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <LinhaTransacao
                  key={t.id}
                  t={t}
                  data={formatarData(t.data)}
                  valor={<Valor centavos={t.valorCentavos} sinal />}
                  selo={<SeloEscopo escopo={t.escopo} />}
                  categoriaNome={CATEGORIAS_PADRAO.find((c) => c.id === t.categoriaId)?.nome ?? "Sem categoria"}
                  naturezaNome={t.natureza !== "comum" ? ROTULOS_NATUREZA[t.natureza] : null}
                />
              ))}
            </tbody>
          </table>
        )}
      </Cartao>
      {lista.length >= 500 && <p className="text-xs text-suave">Mostrando as 500 mais recentes. Use os filtros para ver outras.</p>}
    </>
  );
}
