import { LinkAjuda } from "@/components/link-ajuda";
import { connection } from "next/server";
import { Suspense } from "react";
import { Cartao, Carregando } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { iaDisponivel } from "@/lib/ia/cliente";
import { listarContas } from "@/lib/consultas";
import { formatarData } from "@/lib/formato";
import { trabalhosRecentes } from "@/lib/importacao/fila";
import { Importador } from "./importador";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaImportar({ searchParams }: { searchParams: Busca }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Importar extratos e faturas <LinkAjuda secao="importar" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Arraste quantos arquivos quiser: OFX, CSV, PDF ou foto (PNG/JPG). O app identifica o banco, a conta e as
          transações, ignora o que já foi importado e classifica tudo como PF ou PJ.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const db = obterDb();
  const pedida = (await searchParams).conta;
  const [contas, historico, idsAbertos] = await Promise.all([
    listarContas(db),
    db.query.importacoes.findMany({ orderBy: (i, { desc }) => [desc(i.id)], limit: 15 }),
    trabalhosRecentes(db),
  ]);
  const apelidos = new Map(contas.map((c) => [c.id, c.apelido]));
  return (
    <>
      {!iaDisponivel() && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          A IA não está configurada (falta <code>ANTHROPIC_API_KEY</code>). OFX e CSV funcionam normalmente; PDF e
          imagens precisam da IA, e a classificação fica só com regras e heurísticas.
        </p>
      )}
      <Importador
        contas={contas.map((c) => ({ id: c.id, apelido: c.apelido }))}
        idsIniciais={idsAbertos}
        contaInicial={typeof pedida === "string" && contas.some((c) => String(c.id) === pedida) ? pedida : ""}
      />
      {historico.length > 0 && (
        <Cartao titulo="Últimas importações">
          <table className="w-full text-sm">
            <tbody>
              {historico.map((i) => (
                <tr key={i.id} className="border-t border-borda first:border-0">
                  <td className="py-1.5 pr-2">{i.nomeArquivo}</td>
                  <td className="pr-2 text-suave">{apelidos.get(i.contaId)}</td>
                  <td className="pr-2 text-suave">
                    {i.periodoInicio && i.periodoFim ? `${formatarData(i.periodoInicio)} – ${formatarData(i.periodoFim)}` : ""}
                  </td>
                  <td className="numero text-right">
                    {i.qtdNovas} novas{i.qtdDuplicadas > 0 && <span className="text-suave"> · {i.qtdDuplicadas} repetidas</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
