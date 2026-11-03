import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { clientes, compromissos } from "@/lib/db/schema";
import { primeiroDoMes } from "@/lib/datas";
import { resumoRecebiveis } from "@/lib/fiscal/indicadores";
import { formatarData, formatarMoeda } from "@/lib/formato";

export default function PaginaReceber() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Contas a receber <LinkAjuda secao="receber" />
        </h1>
        <p className="mt-1 text-sm text-suave">Cobranças da empresa: o que está para entrar, o que atrasou e o que já entrou.</p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

async function Conteudo() {
  await connection();
  const db = obterDb();
  const resumo = await resumoRecebiveis(db);
  const inicioMes = primeiroDoMes();
  const colunas = {
    id: compromissos.id,
    descricao: compromissos.descricao,
    cliente: clientes.nome,
    valorCentavos: compromissos.valorCentavos,
    vencimento: compromissos.vencimento,
    dataPagamento: compromissos.dataPagamento,
    formaPagamento: compromissos.formaPagamento,
    status: compromissos.status,
    link: compromissos.link,
  };
  const base = db.select(colunas).from(compromissos).leftJoin(clientes, eq(clientes.id, compromissos.clienteId));
  const [abertas, recebidas] = await Promise.all([
    base
      .where(and(eq(compromissos.tipo, "receber"), inArray(compromissos.status, ["aberto", "vencido"])))
      .orderBy(asc(compromissos.vencimento)),
    db
      .select(colunas)
      .from(compromissos)
      .leftJoin(clientes, eq(clientes.id, compromissos.clienteId))
      .where(and(eq(compromissos.tipo, "receber"), eq(compromissos.status, "pago"), gte(compromissos.dataPagamento, inicioMes)))
      .orderBy(desc(compromissos.dataPagamento)),
  ]);

  if (abertas.length === 0 && recebidas.length === 0 && resumo.recebidoMesCentavos === 0) {
    return (
      <Cartao>
        <p className="text-sm text-suave">
          Nenhuma cobrança ainda. <Link href="/integracoes" className="underline">Conecte o Asaas</Link> para trazer suas
          cobranças automaticamente.
        </p>
      </Cartao>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <Cartao titulo="A receber em 30 dias">
          <div className="text-2xl font-semibold"><Valor centavos={resumo.aReceber30dCentavos} /></div>
          <div className="text-xs text-suave">{resumo.aReceber30dQtd} cobrança(s)</div>
        </Cartao>
        <Cartao titulo="Vencido">
          <div className={`text-2xl font-semibold ${resumo.vencidoCentavos > 0 ? "text-negativo" : ""}`}>
            <Valor centavos={resumo.vencidoCentavos} />
          </div>
          <div className="text-xs text-suave">
            {resumo.vencidoQtd} cobrança(s) · inadimplência {pct(resumo.inadimplencia)}
          </div>
        </Cartao>
        <Cartao titulo="Recebido este mês">
          <div className="text-2xl font-semibold"><Valor centavos={resumo.recebidoMesCentavos} /></div>
          <div className="text-xs text-suave">
            {resumo.atrasoMedioDias === null
              ? "sem pagamentos recentes"
              : resumo.atrasoMedioDias > 0
                ? `clientes pagam, em média, ${resumo.atrasoMedioDias} dia(s) depois do vencimento`
                : "clientes pagam em dia, em média"}
          </div>
        </Cartao>
        <Cartao titulo="Dependência do maior cliente">
          <div className={`text-2xl font-semibold ${resumo.maiorCliente && resumo.maiorCliente.participacao > 0.3 ? "text-alerta" : ""}`}>
            {resumo.maiorCliente ? pct(resumo.maiorCliente.participacao) : "—"}
          </div>
          <div className="truncate text-xs text-suave">
            {resumo.maiorCliente ? `${resumo.maiorCliente.nome}, últimos 12 meses` : "sem dados"}
          </div>
        </Cartao>
      </div>

      <TabelaCobrancas titulo="Em aberto e vencidas" linhas={abertas} vazio="Nada em aberto." mostrarPagamento={false} />
      <TabelaCobrancas titulo="Recebidas este mês" linhas={recebidas} vazio="Nada recebido ainda este mês." mostrarPagamento />
    </>
  );
}

type Linha = {
  id: number;
  descricao: string;
  cliente: string | null;
  valorCentavos: number;
  vencimento: string;
  dataPagamento: string | null;
  formaPagamento: string | null;
  status: string;
  link: string | null;
};

function TabelaCobrancas({ titulo, linhas, vazio, mostrarPagamento }: { titulo: string; linhas: Linha[]; vazio: string; mostrarPagamento: boolean }) {
  const total = linhas.reduce((s, l) => s + l.valorCentavos, 0);
  return (
    <Cartao titulo={`${titulo}${linhas.length ? ` · ${formatarMoeda(total)}` : ""}`} className="overflow-x-auto">
      {linhas.length === 0 ? (
        <p className="text-sm text-suave">{vazio}</p>
      ) : (
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 font-medium">{mostrarPagamento ? "Pago em" : "Vencimento"}</th>
              <th className="py-1 font-medium">Cliente</th>
              <th className="py-1 font-medium">Descrição</th>
              <th className="py-1 font-medium">Forma</th>
              <th className="py-1 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-t border-borda">
                <td className={`numero py-1.5 pr-2 ${l.status === "vencido" ? "text-negativo" : ""}`}>
                  {formatarData(mostrarPagamento && l.dataPagamento ? l.dataPagamento : l.vencimento)}
                  {l.status === "vencido" && " (vencida)"}
                </td>
                <td className="pr-2">{l.cliente ?? "—"}</td>
                <td className="pr-2">
                  {l.link ? (
                    <a href={l.link} target="_blank" rel="noreferrer" className="underline">
                      {l.descricao}
                    </a>
                  ) : (
                    l.descricao
                  )}
                </td>
                <td className="pr-2 text-suave">{l.formaPagamento ?? ""}</td>
                <td className="text-right"><Valor centavos={l.valorCentavos} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Cartao>
  );
}
