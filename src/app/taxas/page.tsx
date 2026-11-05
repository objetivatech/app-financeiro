import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, Indicador, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import {
  formatarData,
  formatarMes,
  formatarMoeda,
  formatarPercentual,
} from "@/lib/formato";
import { NOME_TIPO_TAXA, resumoTaxas, type TipoTaxa } from "@/lib/taxas";

export default function PaginaTaxas({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; mes?: string }>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Taxas e tarifas <LinkAjuda secao="taxas" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Tudo o que o Asaas e os bancos da empresa cobram — notificações, Pix,
          boletos, cartão, notas fiscais, transferências — somado a partir do
          extrato, mês a mês e por tipo.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; mes?: string }>;
}) {
  await connection();
  const { tipo, mes } = await searchParams;
  const r = await resumoTaxas(obterDb(), 12);
  if (r.lancamentos.length === 0) {
    return (
      <Cartao>
        <p className="text-sm text-suave">
          Nenhuma taxa encontrada nos últimos 12 meses. Elas aparecem quando o
          extrato do Asaas (ou de um banco PJ) entra — pela{" "}
          <Link href="/integracoes" className="underline">
            integração
          </Link>{" "}
          ou pelo{" "}
          <Link href="/importar" className="underline">
            Importar
          </Link>
          .
        </p>
      </Cartao>
    );
  }
  const filtrados = r.lancamentos.filter(
    (l) => (!tipo || l.tipo === tipo) && (!mes || l.data.startsWith(mes)),
  );
  const tiposOrdem = r.porTipo.map((t) => t.tipo);
  const mesAtual = r.meses[r.meses.length - 1];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Últimos 12 meses"
          valor={formatarMoeda(r.total12Centavos)}
          detalhe={`${r.lancamentos.filter((l) => l.valorCentavos > 0).length} cobranças de taxa`}
        />
        <Indicador
          rotulo="Média por mês"
          valor={formatarMoeda(r.mediaMensalCentavos)}
          detalhe="meses fechados"
        />
        <Indicador
          rotulo={`Em ${formatarMes(mesAtual)}`}
          valor={formatarMoeda(r.mesAtualCentavos)}
          detalhe="até agora"
        />
        <Indicador
          rotulo="Peso na receita"
          valor={
            r.percentualDaReceita === null
              ? "—"
              : formatarPercentual(r.percentualDaReceita, 2)
          }
          detalhe="taxas ÷ receita bruta (12 meses)"
          tom={
            r.percentualDaReceita !== null && r.percentualDaReceita > 0.03
              ? "atencao"
              : undefined
          }
        />
      </div>

      <Cartao titulo="Por tipo (12 meses)">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-suave">
            <tr>
              <th className="py-1 font-medium">Tipo</th>
              <th className="py-1 text-right font-medium">Quantidade</th>
              <th className="py-1 text-right font-medium">Média</th>
              <th className="py-1 text-right font-medium">Total</th>
              <th className="py-1 text-right font-medium">% das taxas</th>
            </tr>
          </thead>
          <tbody>
            {r.porTipo.map((t) => (
              <tr key={t.tipo} className="border-t border-borda">
                <td className="py-1">
                  <Link
                    href={`/taxas?tipo=${t.tipo}`}
                    className="underline decoration-borda hover:decoration-foreground"
                  >
                    {t.nome}
                  </Link>
                </td>
                <td className="py-1 text-right">{t.quantidade}</td>
                <td className="py-1 text-right">
                  <Valor centavos={t.mediaCentavos} />
                </td>
                <td className="py-1 text-right font-medium">
                  <Valor centavos={t.totalCentavos} />
                </td>
                <td className="py-1 text-right text-suave">
                  {r.total12Centavos
                    ? formatarPercentual(t.totalCentavos / r.total12Centavos, 0)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.conferencia.cobrancas > 0 && (
          <p className="mt-3 text-xs text-suave">
            Conferência: nas {r.conferencia.cobrancas} cobranças do Asaas
            recebidas no período, a diferença entre o valor cobrado e o líquido
            foi de {formatarMoeda(r.conferencia.brutoMenosLiquidoCentavos)} —
            deve ficar perto da soma das taxas de Pix, boleto e cartão acima (as
            de notificação e nota fiscal são cobradas à parte).
          </p>
        )}
      </Cartao>

      <Cartao titulo="Mês a mês">
        <BarrasMensais
          titulo=""
          cor="pj"
          dados={r.porMes.map((m) => ({ mes: m.mes, valor: m.totalCentavos }))}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-left text-suave">
              <tr>
                <th className="py-1 pr-2 font-medium">Mês</th>
                {tiposOrdem.map((t) => (
                  <th key={t} className="py-1 pr-2 text-right font-medium">
                    {NOME_TIPO_TAXA[t].split(" (")[0]}
                  </th>
                ))}
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...r.porMes].reverse().map((m) => (
                <tr key={m.mes} className="border-t border-borda">
                  <td className="py-1 pr-2">
                    <Link
                      href={`/taxas?mes=${m.mes}`}
                      className="underline decoration-borda hover:decoration-foreground"
                    >
                      {formatarMes(m.mes)}
                    </Link>
                  </td>
                  {tiposOrdem.map((t) => (
                    <td key={t} className="py-1 pr-2 text-right">
                      {m.porTipo[t] ? formatarMoeda(m.porTipo[t]!) : "—"}
                    </td>
                  ))}
                  <td className="py-1 text-right font-medium">
                    {formatarMoeda(m.totalCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      <Cartao
        titulo={
          <>
            Lançamentos
            {tipo ? ` · ${NOME_TIPO_TAXA[tipo as TipoTaxa] ?? tipo}` : ""}
            {mes ? ` · ${formatarMes(mes)}` : ""} ({filtrados.length})
            {(tipo || mes) && (
              <Link
                href="/taxas"
                className="ml-2 text-xs font-normal underline"
              >
                ver todos
              </Link>
            )}
          </>
        }
      >
        <details open={Boolean(tipo || mes)}>
          <summary className="cursor-pointer text-sm underline">
            {tipo || mes
              ? "lançamentos do filtro"
              : "ver cada lançamento (clique num tipo ou mês acima para filtrar)"}
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {filtrados.slice(0, 300).map((l) => (
                <tr key={l.id} className="border-t border-borda first:border-0">
                  <td className="whitespace-nowrap py-1 pr-2 text-suave">
                    {formatarData(l.data)}
                  </td>
                  <td className="py-1 pr-2">
                    {l.descricao}
                    <span className="block text-xs text-suave">
                      {NOME_TIPO_TAXA[l.tipo]} · {l.conta}
                    </span>
                  </td>
                  <td
                    className={`py-1 text-right ${l.valorCentavos < 0 ? "text-positivo" : ""}`}
                  >
                    {l.valorCentavos < 0
                      ? `devolvido ${formatarMoeda(-l.valorCentavos)}`
                      : formatarMoeda(l.valorCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 300 && (
            <p className="mt-2 text-xs text-suave">
              Mostrando os 300 mais recentes.
            </p>
          )}
        </details>
      </Cartao>
    </>
  );
}
