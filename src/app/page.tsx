import { connection } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { Cartao, Carregando, Valor } from "@/components/ui";
import { despesasPorCategoria, mesMaisRecenteComDados, periodoDoMes, resumoDoPeriodo, serieMensal, type LinhaCategoria } from "@/lib/consultas";
import { obterDb } from "@/lib/db";
import { analises } from "@/lib/db/schema";
import { deslocarMes, formatarMes, formatarMoeda } from "@/lib/formato";
import { EsquemaAnalise } from "@/lib/ia/analise";
import { iaDisponivel } from "@/lib/ia/cliente";
import { LinkAjuda } from "@/components/link-ajuda";
import { indicadoresFiscais, resumoRecebiveis } from "@/lib/fiscal/indicadores";
import { atualizarCompromissos, contasAPagar, lembretesPendentes, resumoDividas } from "@/lib/compromissos/servico";
import { BotaoAnalise } from "./botao-analise";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function Painel({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const db = obterDb();
  const sp = await searchParams;
  const pedido = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : null;
  const mes = pedido ?? (await mesMaisRecenteComDados(db));

  if (!mes) {
    return (
      <Cartao>
        <h1 className="text-lg font-semibold">Bem-vindo</h1>
        <p className="mt-2 text-sm text-suave">
          Comece importando extratos e faturas das suas contas pessoais e da empresa. O app junta tudo, separa o que é PF
          do que é PJ e mostra onde as duas coisas estão se misturando.
        </p>
        <Link href="/importar" className="mt-4 inline-block rounded-md bg-foreground px-3 py-1.5 text-sm text-background">
          Importar extratos
        </Link>
      </Cartao>
    );
  }

  const periodo = periodoDoMes(mes);
  await atualizarCompromissos(db);
  const [resumo, categorias, serie, ultimaAnalise, recebiveis, fiscal, aPagar, dividasAtivas, lembretes] = await Promise.all([
    resumoDoPeriodo(db, periodo),
    despesasPorCategoria(db, periodo),
    serieMensal(db, 6, mes),
    db.query.analises.findFirst({
      where: and(eq(analises.periodoInicio, periodo.inicio), eq(analises.periodoFim, periodo.fim)),
      orderBy: [desc(analises.id)],
    }),
    resumoRecebiveis(db),
    indicadoresFiscais(db),
    contasAPagar(db, 7),
    resumoDividas(db),
    lembretesPendentes(db),
  ]);
  const dividasEmRisco = dividasAtivas.filter((d) => d.diasAtraso > 0 && d.diasTolerancia);
  const pagarSemana = aPagar.pendentes;
  const temRecebiveis = recebiveis.aReceber30dQtd + recebiveis.vencidoQtd > 0 || recebiveis.recebidoMesCentavos > 0;
  const temFiscal = fiscal.mesesComDados > 0 && fiscal.perfil.proLaboreMensalCentavos > 0;
  const resultadoPj = resumo.pjReceitas - resumo.pjDespesas;
  const saiuDaEmpresa = resumo.retiradas + resumo.pessoalNaPj;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Painel de {formatarMes(mes)} <LinkAjuda secao="painel" />
        </h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/?mes=${deslocarMes(mes, -1)}`} className="underline">
            ← {formatarMes(deslocarMes(mes, -1))}
          </Link>
          <Link href={`/?mes=${deslocarMes(mes, 1)}`} className="underline">
            {formatarMes(deslocarMes(mes, 1))} →
          </Link>
        </div>
      </div>

      {dividasEmRisco.map((d) => (
        <Link key={d.id} href="/pagar" className="block rounded-md border border-negativo/50 bg-negativo/10 p-3 text-sm">
          <strong>⚠ {d.nome}: parcela atrasada há {d.diasAtraso} dia(s)</strong> — limite de {d.diasTolerancia} dias. {d.consequenciaAtraso}
        </Link>
      ))}
      {lembretes.length > 0 && (
        <Link href="/pagar" className="block rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          📎 {lembretes.length} lembrete(s) depois de pagar (ex.: enviar comprovante). Ver em A pagar.
        </Link>
      )}
      {pagarSemana.length > 0 && (
        <Link href="/pagar" className="block rounded-md border border-borda bg-superficie p-3 text-sm hover:border-foreground/30">
          A pagar nos próximos 7 dias:{" "}
          <strong>{pagarSemana.length} conta(s)</strong>, <Valor centavos={pagarSemana.reduce((t, p) => t + p.valorCentavos, 0)} />
          {pagarSemana.some((p) => p.status === "vencido") && <span className="text-negativo"> · há contas vencidas</span>}
        </Link>
      )}
      {(resumo.paraRevisar > 0 || resumo.semEscopo > 0) && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          ⚠ {resumo.paraRevisar > 0 && <>{resumo.paraRevisar} transação(ões) para revisar. </>}
          {resumo.semEscopo > 0 && <>{resumo.semEscopo} sem definição de PF/PJ. </>}
          <Link href={`/transacoes?mes=${mes}&revisar=1`} className="underline">
            Revisar agora
          </Link>
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Cartao titulo={<span className="text-pj">Empresa (PJ)</span>}>
          <div className="text-2xl font-semibold">
            <Valor centavos={resultadoPj} sinal />
          </div>
          <div className="mt-1 text-xs text-suave">resultado do mês (receitas − despesas)</div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">Receitas</dt>
            <dd className="text-right"><Valor centavos={resumo.pjReceitas} /></dd>
            <dt className="text-suave">Despesas</dt>
            <dd className="text-right"><Valor centavos={resumo.pjDespesas} /></dd>
          </dl>
        </Cartao>
        <Cartao titulo={<span className="text-pf">Pessoal (PF)</span>}>
          <div className="text-2xl font-semibold">
            <Valor centavos={resumo.pfDespesas} />
          </div>
          <div className="mt-1 text-xs text-suave">custo de vida no mês</div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">Outras receitas PF</dt>
            <dd className="text-right"><Valor centavos={resumo.pfReceitas} /></dd>
            <dt className="text-suave">Pagos pela empresa</dt>
            <dd className="text-right"><Valor centavos={resumo.pessoalNaPj} /></dd>
          </dl>
        </Cartao>
        <Cartao titulo="Empresa → você">
          <div className="text-2xl font-semibold">
            <Valor centavos={saiuDaEmpresa} />
          </div>
          <div className="mt-1 text-xs text-suave">
            {resultadoPj > 0 && saiuDaEmpresa > resultadoPj
              ? `⚠ ${formatarMoeda(saiuDaEmpresa - resultadoPj)} acima do que a empresa gerou`
              : resultadoPj <= 0 && saiuDaEmpresa > 0
                ? "⚠ a empresa não gerou resultado e mesmo assim houve retirada"
                : "retiradas + gastos pessoais pagos pela PJ"}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">Retiradas (Pix, pró-labore, lucros)</dt>
            <dd className="text-right"><Valor centavos={resumo.retiradas} /></dd>
            <dt className="text-suave">Aportes seus na empresa</dt>
            <dd className="text-right"><Valor centavos={resumo.aportes} /></dd>
            <dt className="text-suave">Gastos da PJ pagos por você</dt>
            <dd className="text-right"><Valor centavos={resumo.pjNaPf} /></dd>
          </dl>
        </Cartao>
      </div>

      {(temRecebiveis || temFiscal) && (
        <div className="grid gap-3 md:grid-cols-3">
          {temRecebiveis && (
            <Link href="/receber" className="rounded-lg border border-borda bg-superficie p-4 hover:border-foreground/30">
              <div className="text-sm text-suave">A receber em 30 dias</div>
              <div className="text-lg font-semibold"><Valor centavos={recebiveis.aReceber30dCentavos} /></div>
              <div className="text-xs text-suave">{recebiveis.aReceber30dQtd} cobrança(s)</div>
            </Link>
          )}
          {temRecebiveis && (
            <Link href="/receber" className="rounded-lg border border-borda bg-superficie p-4 hover:border-foreground/30">
              <div className="text-sm text-suave">Cobranças vencidas</div>
              <div className={`text-lg font-semibold ${recebiveis.vencidoCentavos > 0 ? "text-negativo" : ""}`}>
                <Valor centavos={recebiveis.vencidoCentavos} />
              </div>
              <div className="text-xs text-suave">{recebiveis.vencidoQtd} cobrança(s)</div>
            </Link>
          )}
          {temFiscal && (
            <Link href="/impostos" className="rounded-lg border border-borda bg-superficie p-4 hover:border-foreground/30">
              <div className="text-sm text-suave">Fator R · Anexo {fiscal.diagnostico.anexo}</div>
              <div className={`text-lg font-semibold ${fiscal.diagnostico.fatorR >= 0.28 ? "text-positivo" : "text-negativo"}`}>
                {(fiscal.diagnostico.fatorR * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </div>
              <div className="text-xs text-suave">DAS estimado do mês: <Valor centavos={fiscal.diagnostico.dasEstimadoCentavos} /></div>
            </Link>
          )}
        </div>
      )}

      {serie.length > 1 && (
        <Cartao titulo="Últimos meses">
          <div className="grid gap-6 md:grid-cols-3">
            <BarrasMensais titulo="Resultado da empresa" cor="pj" dados={serie.map((s) => ({ mes: s.mes, valor: s.pjResultado }))} />
            <BarrasMensais titulo="Custo de vida (PF)" cor="pf" dados={serie.map((s) => ({ mes: s.mes, valor: s.pfDespesas }))} />
            <BarrasMensais titulo="Empresa → você" cor="alerta" dados={serie.map((s) => ({ mes: s.mes, valor: s.retiradas }))} />
          </div>
        </Cartao>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ListaCategorias titulo="Para onde foi o dinheiro pessoal" cor="pf" linhas={categorias.filter((c) => c.escopo === "PF")} mes={mes} escopo="PF" />
        <ListaCategorias titulo="Despesas da empresa" cor="pj" linhas={categorias.filter((c) => c.escopo === "PJ")} mes={mes} escopo="PJ" />
      </div>

      <Cartao titulo="Diagnóstico e dicas">
        {ultimaAnalise ? <AnaliseSalva conteudo={ultimaAnalise.conteudo} /> : (
          <p className="mb-3 text-sm text-suave">
            A IA olha os totais do mês, os gastos recorrentes e as maiores saídas e sugere o que ajustar.
          </p>
        )}
        <div className="mt-4">
          {iaDisponivel() ? (
            <BotaoAnalise mes={mes} temAnalise={Boolean(ultimaAnalise)} />
          ) : (
            <p className="text-sm text-suave">Configure a ANTHROPIC_API_KEY para gerar análises.</p>
          )}
        </div>
      </Cartao>
    </div>
  );
}

function ListaCategorias({ titulo, cor, linhas, mes, escopo }: { titulo: string; cor: "pf" | "pj"; linhas: LinhaCategoria[]; mes: string; escopo: "PF" | "PJ" }) {
  const max = Math.max(1, ...linhas.map((l) => l.totalCentavos));
  const total = linhas.reduce((s, l) => s + l.totalCentavos, 0);
  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 ? (
        <p className="text-sm text-suave">Nada classificado ainda.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {linhas.slice(0, 10).map((l) => (
            <li key={l.categoriaId ?? "sem"}>
              <div className="flex justify-between gap-2">
                <span>{l.nome}</span>
                <span className="numero">
                  {formatarMoeda(l.totalCentavos)} <span className="text-xs text-suave">{Math.round((l.totalCentavos / total) * 100)}%</span>
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

function AnaliseSalva({ conteudo }: { conteudo: string }) {
  const lido = EsquemaAnalise.safeParse(JSON.parse(conteudo));
  if (!lido.success) return <p className="text-sm text-suave">Análise salva em formato antigo. Gere outra.</p>;
  const a = lido.data;
  const corGravidade = { alta: "text-negativo", media: "text-alerta", baixa: "text-suave" } as const;
  return (
    <div className="space-y-4 text-sm">
      <p>{a.resumo}</p>
      {a.alertas.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Alertas</h3>
          <ul className="space-y-2">
            {a.alertas.map((al, i) => (
              <li key={i}>
                <span className={`mr-1 text-xs font-medium uppercase ${corGravidade[al.gravidade]}`}>{al.gravidade}</span>
                <strong>{al.titulo}.</strong> {al.detalhe}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.dicas.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Dicas</h3>
          <ul className="space-y-2">
            {a.dicas.map((d, i) => (
              <li key={i}>
                <strong>{d.titulo}.</strong> {d.detalhe}{" "}
                <span className="text-suave">→ {d.acao}</span>
                {d.economia_mensal_estimada ? (
                  <span className="ml-1 text-positivo">(~{formatarMoeda(d.economia_mensal_estimada * 100)}/mês)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.perguntas_para_o_contador.length > 0 && (
        <div>
          <h3 className="mb-1 font-medium">Perguntas para levar ao contador</h3>
          <ul className="ml-5 list-disc space-y-1">
            {a.perguntas_para_o_contador.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
