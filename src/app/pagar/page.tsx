import { BotaoEnviar, Formulario } from "@/components/formulario";
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { LinkAjuda } from "@/components/link-ajuda";
import { Cartao, Carregando, SeloEscopo, Valor } from "@/components/ui";
import { CATEGORIAS_PADRAO } from "@/lib/classificacao/categorias";
import { taxaAnual } from "@/lib/compromissos/calculo";
import { atualizarCompromissos, contasAPagar, lembretesPendentes, resumoDividas, type ItemAPagar, type ResumoDivida } from "@/lib/compromissos/servico";
import { hojeBrasil } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { recorrencias } from "@/lib/db/schema";
import { listarContas } from "@/lib/consultas";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { desfazer, encerrarRecorrencia, excluirDivida, lembreteFeito, pagar } from "./acoes";
import { FormularioAvulsa, FormularioDivida, FormularioRecorrencia } from "./formularios";

export default function PaginaPagar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Contas a pagar e dívidas <LinkAjuda secao="pagar" />
        </h1>
        <p className="mt-1 text-sm text-suave">
          Parcelas, contas fixas e contas avulsas. Quando o pagamento aparece no extrato, o app dá baixa sozinho.
        </p>
      </div>
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

const ROTULO_ORIGEM: Record<string, string> = { divida: "Dívida", recorrencia: "Conta fixa", manual: "Avulsa" };
const ROTULO_TIPO: Record<string, string> = {
  acordo_judicial: "Acordo judicial",
  emprestimo: "Empréstimo",
  parcelamento_imposto: "Parcelamento de imposto",
  financiamento: "Financiamento",
  compra_parcelada: "Compra parcelada",
  outro: "Outro",
};
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

async function Conteudo() {
  await connection();
  const db = obterDb();
  await atualizarCompromissos(db);
  const [{ pendentes, pagasRecentes }, listaDividas, lembretes, fixas, contas] = await Promise.all([
    contasAPagar(db, 30),
    resumoDividas(db),
    lembretesPendentes(db),
    db.query.recorrencias.findMany({ where: eq(recorrencias.ativa, true), orderBy: [asc(recorrencias.diaVencimento)] }),
    listarContas(db),
  ]);
  const contasSimples = contas.map((c) => ({ id: c.id, apelido: c.apelido }));
  const emRisco = listaDividas.filter((d) => d.diasAtraso > 0 && d.diasTolerancia);
  const vencidas = pendentes.filter((p) => p.status === "vencido");
  const hoje = hojeBrasil();
  const em7 = pendentes.filter((p) => p.status !== "vencido" && Date.parse(p.vencimento) - Date.parse(hoje) <= 7 * 86_400_000);
  const comprometimento = listaDividas.reduce((s, d) => s + d.parcelaMensalCentavos, 0);
  const totalDevido = listaDividas.reduce((s, d) => s + d.restanteCentavos, 0);

  return (
    <>
      {emRisco.map((d) => (
        <div key={d.id} className="rounded-md border border-negativo/50 bg-negativo/10 p-3 text-sm">
          <strong>⚠ {d.nome}: parcela atrasada há {d.diasAtraso} dia(s).</strong>{" "}
          {d.diasTolerancia! - d.diasAtraso > 0
            ? `Faltam ${d.diasTolerancia! - d.diasAtraso} dia(s) para o limite de ${d.diasTolerancia}.`
            : `O limite de ${d.diasTolerancia} dias já passou.`}{" "}
          {d.consequenciaAtraso}
        </div>
      ))}
      {lembretes.map((l) => (
        <Formulario key={l.compromissoId} acao={lembreteFeito} mensagemOk={null} retornoEmLinha className="flex flex-wrap items-center gap-3 rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          <input type="hidden" name="id" value={l.compromissoId} />
          <span>
            📎 <strong>{l.descricao}</strong> paga em {formatarData(l.dataPagamento)}: {l.lembrete}
          </span>
          <BotaoEnviar variante="link" pendente="salvando…">
            feito
          </BotaoEnviar>
        </Formulario>
      ))}

      <div className="grid gap-3 md:grid-cols-4">
        <Cartao titulo="Vencidas">
          <div className={`text-2xl font-semibold ${vencidas.length ? "text-negativo" : ""}`}>
            <Valor centavos={vencidas.reduce((s, p) => s + p.valorCentavos, 0)} />
          </div>
          <div className="text-xs text-suave">{vencidas.length} conta(s)</div>
        </Cartao>
        <Cartao titulo="Próximos 7 dias">
          <div className="text-2xl font-semibold"><Valor centavos={em7.reduce((s, p) => s + p.valorCentavos, 0)} /></div>
          <div className="text-xs text-suave">{em7.length} conta(s)</div>
        </Cartao>
        <Cartao titulo="Parcelas de dívidas por mês">
          <div className="text-2xl font-semibold"><Valor centavos={comprometimento} /></div>
          <div className="text-xs text-suave">soma da próxima parcela de cada dívida</div>
        </Cartao>
        <Cartao titulo="Total que falta pagar">
          <div className="text-2xl font-semibold"><Valor centavos={totalDevido} /></div>
          <div className="text-xs text-suave">{listaDividas.length} dívida(s) ativa(s)</div>
        </Cartao>
      </div>

      <Cartao titulo="Próximos 30 dias" className="overflow-x-auto">
        {pendentes.length === 0 ? (
          <p className="text-sm text-suave">Nada a pagar nos próximos 30 dias.</p>
        ) : (
          <TabelaPagar itens={pendentes} hoje={hoje} />
        )}
        {pagasRecentes.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-suave">Pagas nos últimos 15 dias ({pagasRecentes.length})</summary>
            <ul className="mt-2 space-y-1">
              {pagasRecentes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {formatarData(p.dataPagamento!)} · {p.descricao} · <Valor centavos={p.valorCentavos} />
                  </span>
                  <Formulario acao={desfazer} mensagemOk={null} retornoEmLinha className="text-xs">
                    <input type="hidden" name="id" value={p.id} />
                    <BotaoEnviar variante="link" pendente="desfazendo…" className="text-suave">
                      desfazer
                    </BotaoEnviar>
                  </Formulario>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Cartao>

      <Cartao titulo={<>Dívidas <LinkAjuda secao="dividas" /></>}>
        {listaDividas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma dívida cadastrada. Use o formulário abaixo.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {listaDividas.map((d) => (
              <CartaoDivida key={d.id} d={d} />
            ))}
          </div>
        )}
        <OrdemDeQuitacao dividas={listaDividas} />
      </Cartao>

      <Cartao titulo="Contas fixas (todo mês)">
        {fixas.length === 0 ? (
          <p className="text-sm text-suave">Nenhuma ainda. Cadastre pró-labore, DAS, INSS, contabilidade, aluguel, escola…</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {fixas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-1 first:border-0">
                <span className="flex items-center gap-2">
                  <SeloEscopo escopo={r.escopo} /> Dia {r.diaVencimento} · {r.descricao} · {r.tipo === "receber" ? "entra" : "sai"}{" "}
                  <Valor centavos={r.valorCentavos} />
                </span>
                <Formulario acao={encerrarRecorrencia} mensagemOk={null} retornoEmLinha className="text-xs">
                  <input type="hidden" name="id" value={r.id} />
                  <BotaoEnviar variante="link" pendente="encerrando…" className="text-suave">
                    encerrar
                  </BotaoEnviar>
                </Formulario>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Cadastrar">
        <div className="space-y-4">
          <details>
            <summary className="cursor-pointer font-medium">Nova dívida (acordo, empréstimo, parcelamento…)</summary>
            <div className="mt-3">
              <FormularioDivida contas={contasSimples} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">Nova conta fixa (todo mês)</summary>
            <div className="mt-3">
              <FormularioRecorrencia contas={contasSimples} categorias={CATEGORIAS_PADRAO} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-medium">Conta avulsa (uma vez só)</summary>
            <div className="mt-3">
              <FormularioAvulsa contas={contasSimples} />
            </div>
          </details>
        </div>
      </Cartao>
    </>
  );
}

function TabelaPagar({ itens, hoje }: { itens: ItemAPagar[]; hoje: string }) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead className="text-left text-xs text-suave">
        <tr>
          <th className="py-1 font-medium">Vencimento</th>
          <th className="py-1 font-medium">Descrição</th>
          <th className="py-1 font-medium">Origem</th>
          <th className="py-1 text-right font-medium">Valor</th>
          <th className="py-1 text-right font-medium">Pagar</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((p) => (
          <tr key={p.id} className="border-t border-borda">
            <td className={`numero py-1.5 pr-2 ${p.status === "vencido" ? "text-negativo" : ""}`}>
              {formatarData(p.vencimento)}
              {p.status === "vencido" && ` (${Math.round((Date.parse(hoje) - Date.parse(p.vencimento)) / 86_400_000)}d)`}
            </td>
            <td className="pr-2">
              <span className="mr-1.5"><SeloEscopo escopo={p.escopo} /></span>
              {p.descricao}
            </td>
            <td className="pr-2 text-suave">{ROTULO_ORIGEM[p.origem] ?? p.origem}</td>
            <td className="text-right"><Valor centavos={p.valorCentavos} /></td>
            <td className="text-right">
              <Formulario acao={pagar} mensagemOk={null} retornoEmLinha className="inline-flex flex-wrap items-center justify-end gap-1">
                <input type="hidden" name="id" value={p.id} />
                <input type="date" name="data" defaultValue={hoje} className="rounded border border-borda bg-superficie px-1 py-0.5 text-xs" />
                <BotaoEnviar variante="link" pendente="salvando…" className="text-xs">
                  pago
                </BotaoEnviar>
              </Formulario>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CartaoDivida({ d }: { d: ResumoDivida }) {
  const progresso = d.parcelasTotal ? d.parcelasPagas / d.parcelasTotal : 0;
  return (
    <div className={`rounded-md border p-3 text-sm ${d.diasAtraso > 0 ? "border-negativo/50" : "border-borda"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <SeloEscopo escopo={d.escopo} /> {d.nome}
          </div>
          <div className="text-xs text-suave">
            {ROTULO_TIPO[d.tipo] ?? d.tipo}
            {d.credor ? ` · ${d.credor}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold"><Valor centavos={d.restanteCentavos} /></div>
          <div className="text-xs text-suave">falta pagar</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-foreground/5">
        <div className="h-1.5 rounded-full bg-positivo" style={{ width: `${progresso * 100}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-suave">Parcelas pagas</dt>
        <dd className="text-right">
          {d.parcelasPagas} de {d.parcelasTotal}
        </dd>
        {d.proximaParcela && (
          <>
            <dt className="text-suave">Próxima</dt>
            <dd className={`text-right ${d.diasAtraso > 0 ? "text-negativo" : ""}`}>
              {formatarData(d.proximaParcela.vencimento)} · {formatarMoeda(d.proximaParcela.valorCentavos)}
            </dd>
          </>
        )}
        {d.ultimoVencimento && (
          <>
            <dt className="text-suave">Termina em</dt>
            <dd className="text-right">{formatarData(d.ultimoVencimento)}</dd>
          </>
        )}
        {d.taxaMensal !== null && (
          <>
            <dt className="text-suave">Juros</dt>
            <dd className={`text-right ${d.taxaMensal > 0.05 ? "text-negativo" : ""}`}>
              {pct(d.taxaMensal)} ao mês ({pct(taxaAnual(d.taxaMensal))} ao ano)
            </dd>
          </>
        )}
      </dl>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-suave">excluir</summary>
        <Formulario acao={excluirDivida} mensagemOk={null} retornoEmLinha className="mt-1 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={d.id} />
          <label className="flex items-center gap-1 text-suave">
            <input type="checkbox" name="confirmar" /> apagar a dívida e todas as parcelas
          </label>
          <BotaoEnviar variante="link" pendente="excluindo…" className="text-negativo">
            excluir
          </BotaoEnviar>
        </Formulario>
      </details>
    </div>
  );
}

/**
 * Método "avalanche": sobrando dinheiro, antecipe primeiro a dívida com o maior juro.
 * Dívidas com regra de atraso (acordos) vêm antes de tudo: não podem atrasar.
 */
function OrdemDeQuitacao({ dividas }: { dividas: ResumoDivida[] }) {
  const comTaxa = dividas.filter((d) => d.taxaMensal !== null && d.restanteCentavos > 0).sort((a, b) => b.taxaMensal! - a.taxaMensal!);
  const semTaxa = dividas.filter((d) => d.taxaMensal === null && d.restanteCentavos > 0 && !d.diasTolerancia);
  const protegidas = dividas.filter((d) => d.diasTolerancia && d.restanteCentavos > 0);
  if (dividas.length === 0) return null;
  return (
    <div className="mt-4 border-t border-borda pt-3 text-sm">
      <h3 className="font-medium">Se sobrar dinheiro, quite nesta ordem</h3>
      <ol className="ml-5 mt-1 list-decimal space-y-0.5">
        {protegidas.map((d) => (
          <li key={d.id}>
            <strong>{d.nome}</strong>: nunca atrasar (perde o acordo depois de {d.diasTolerancia} dias). Pagar em dia, sem precisar antecipar.
          </li>
        ))}
        {comTaxa.map((d) => (
          <li key={d.id}>
            <strong>{d.nome}</strong>: {pct(d.taxaMensal!)} ao mês. Antecipar economiza juros.
          </li>
        ))}
      </ol>
      {semTaxa.length > 0 && (
        <p className="mt-1 text-xs text-suave">
          Para ordenar {semTaxa.map((d) => d.nome).join(", ")}, cadastre o valor que você recebeu (assim o app calcula os juros).
        </p>
      )}
    </div>
  );
}
