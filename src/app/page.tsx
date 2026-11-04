import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { FluxoDinheiro, type NoFluxo } from "@/components/fluxo-dinheiro";
import { LinkAjuda } from "@/components/link-ajuda";
import { SeletorMes } from "@/components/seletor-mes";
import { Cartao, Carregando, Indicador, LinhaValor, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { analises, transacoes } from "@/lib/db/schema";
import { formatarMes } from "@/lib/formato";
import { iaDisponivel } from "@/lib/ia/cliente";
import { mesDeReferencia } from "@/lib/visoes/consultas";
import { dadosConsolidado, fluxoDoMes } from "@/lib/visoes/paineis";
import { periodoDoMes } from "@/lib/consultas";
import { AvisosDoPainel } from "@/components/avisos-painel";
import { AnaliseSalva } from "./analise-salva";
import { BotaoAnalise } from "./botao-analise";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PainelConsolidado({ searchParams }: { searchParams: Busca }) {
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
  if ((await db.$count(transacoes)) === 0) return <BoasVindas />;
  const mes = await mesDeReferencia(db, sp.mes);
  const periodo = periodoDoMes(mes);
  const [d, ultimaAnalise] = await Promise.all([
    dadosConsolidado(db, mes),
    db.query.analises.findFirst({
      where: and(eq(analises.periodoInicio, periodo.inicio), eq(analises.periodoFim, periodo.fim)),
      orderBy: [desc(analises.id)],
    }),
  ]);
  const { pj, pf, total } = d.atual;
  const fluxo = fluxoDoMes(pj, pf);
  const p = d.pendencias;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Consolidado · {formatarMes(mes)} <LinkAjuda secao="painel" />
          </h1>
          <p className="text-sm text-suave">Você e a empresa juntos: de onde veio o dinheiro, para onde foi e o que sobrou em cada lado.</p>
        </div>
        <SeletorMes caminho="/" mes={mes} />
      </div>

      <Suspense fallback={null}>
        <AvisosDoPainel limite={3} />
      </Suspense>
      {d.aPagarSemana.length > 0 && (
        <Link href="/pagar" className="block rounded-md border border-borda bg-superficie p-3 text-sm hover:border-foreground/30">
          A pagar nos próximos 7 dias: <strong>{d.aPagarSemana.length} conta(s)</strong>,{" "}
          <Valor centavos={d.aPagarSemana.reduce((t, x) => t + x.valorCentavos, 0)} />
          {d.aPagarSemana.some((x) => x.status === "vencido") && <span className="text-negativo"> · há contas vencidas</span>}
        </Link>
      )}
      {(p.paraRevisar > 0 || p.semEscopo > 0) && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          ⚠ {p.paraRevisar > 0 && <>{p.paraRevisar} transação(ões) para revisar. </>}
          {p.semEscopo > 0 && <>{p.semEscopo} sem definição de PF/PJ — ficam fora das contas abaixo. </>}
          <Link href={`/transacoes?mes=${mes}&revisar=1`} className="underline">
            Revisar agora
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Resultado do mês (PF + PJ)"
          valor={<Valor centavos={total.resultado} sinal />}
          detalhe={total.resultado >= 0 ? "entrou mais do que saiu" : "saiu mais do que entrou"}
          tom={total.resultado >= 0 ? "bom" : "ruim"}
        />
        <Indicador rotulo="Ficou na empresa" valor={<Valor centavos={total.ficouNaEmpresa} sinal />} detalhe="depois de pagar você" href={`/pj?mes=${mes}`} />
        <Indicador rotulo="Sobrou para você" valor={<Valor centavos={total.sobrouParaVoce} sinal />} detalhe="depois do custo de vida e das dívidas" href={`/pf?mes=${mes}`} />
        <Indicador
          rotulo="Posição líquida hoje"
          valor={<Valor centavos={d.posicaoLiquida} sinal />}
          detalhe="caixa + a receber − dívidas − cartões"
          tom={d.posicaoLiquida >= 0 ? "bom" : "ruim"}
        />
      </div>

      <Cartao titulo={<>Para onde foi o dinheiro em {formatarMes(mes)}</>}>
        <FluxoDinheiro titulo={`Fluxo do dinheiro em ${formatarMes(mes)}`} nos={fluxo.nos as unknown as NoFluxo[]} ligacoes={fluxo.ligacoes} />
        <p className="mt-2 text-xs text-suave">
          Compras no cartão contam na data da compra; transferências entre suas contas, pagamento de fatura e aplicações não são
          gasto. “Do caixa” aparece quando saiu mais do que entrou (o dinheiro veio do saldo ou de crédito).
        </p>
      </Cartao>

      <div className="grid gap-3 md:grid-cols-2">
        <Cartao titulo="Posição de curto prazo">
          <div className="text-sm">
            <LinhaValor rotulo={<span className="text-pj">Caixa da empresa</span>} centavos={d.saldos.PJ} />
            <LinhaValor rotulo={<span className="text-pf">Seu caixa</span>} centavos={d.saldos.PF} />
            <LinhaValor rotulo="A receber em 30 dias" centavos={d.aReceber} />
            <LinhaValor rotulo="(−) Dívidas a pagar (todas as parcelas)" centavos={-d.dividasRestantes} />
            <LinhaValor rotulo="(−) Cartões: fatura em aberto + parcelas futuras" centavos={-d.cartoesAVencer} />
            <LinhaValor rotulo="Posição líquida" centavos={d.posicaoLiquida} destaque sinal />
          </div>
          {d.saldos.contasSemSaldo > 0 && (
            <p className="mt-2 text-xs text-suave">{d.saldos.contasSemSaldo} conta(s) sem saldo conhecido ficaram fora do caixa.</p>
          )}
        </Cartao>
        <Cartao titulo="Mistura entre PF e PJ no mês">
          <div className="text-sm">
            <LinhaValor rotulo="Gastos pessoais pagos pela empresa" centavos={pj.pessoalNaPj} />
            <LinhaValor rotulo="Gastos da empresa pagos por você" centavos={pj.pagoPeloSocio} />
            <LinhaValor rotulo="Retiradas (Pix da PJ para você)" centavos={pj.retiradas} />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-suave">
            {p.retiradasIndefinidas > 0 && (
              <li>
                ⚠ {p.retiradasIndefinidas} retirada(s) sem definir se é pró-labore ou lucro —{" "}
                <Link href={`/transacoes?mes=${mes}&revisar=1`} className="underline">definir</Link> (muda o imposto e o Fator R).
              </li>
            )}
            {p.emContaMista > 0 && <li>⚠ {p.emContaMista} lançamento(s) em conta mista sem PF/PJ.</li>}
            {pj.pessoalNaPj === 0 && p.retiradasIndefinidas === 0 && p.emContaMista === 0 && <li>✓ Nada misturado neste mês.</li>}
          </ul>
        </Cartao>
      </div>

      {d.serie.some((s) => s.total.entradas !== 0 || s.total.custoDeVida !== 0) && (
        <Cartao titulo="Últimos meses">
          <div className="grid gap-6 md:grid-cols-3">
            <BarrasMensais titulo="Resultado PF + PJ" cor="neutro" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.total.resultado }))} />
            <BarrasMensais titulo="Ficou na empresa" cor="pj" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.total.ficouNaEmpresa }))} />
            <BarrasMensais titulo="Sobrou para você" cor="pf" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.total.sobrouParaVoce }))} />
          </div>
        </Cartao>
      )}

      <Cartao titulo="Diagnóstico e dicas">
        {ultimaAnalise ? (
          <AnaliseSalva conteudo={ultimaAnalise.conteudo} />
        ) : (
          <p className="mb-3 text-sm text-suave">
            A IA olha os números do mês (PF, PJ e o que passa de um para o outro), os gastos recorrentes e as maiores saídas, e
            sugere o que ajustar.
          </p>
        )}
        <div className="mt-4">
          {iaDisponivel() ? <BotaoAnalise mes={mes} temAnalise={Boolean(ultimaAnalise)} /> : <p className="text-sm text-suave">Configure a ANTHROPIC_API_KEY para gerar análises.</p>}
        </div>
      </Cartao>
    </div>
  );
}

function BoasVindas() {
  return (
    <Cartao>
      <h1 className="text-lg font-semibold">Bem-vindo</h1>
      <p className="mt-2 text-sm text-suave">
        Comece importando extratos e faturas das suas contas pessoais e da empresa. O app junta tudo, separa o que é PF do que é
        PJ e mostra o caminho do dinheiro entre os dois.
      </p>
      <Link href="/importar" className="mt-4 inline-block rounded-md bg-foreground px-3 py-1.5 text-sm text-background">
        Importar extratos
      </Link>
    </Cartao>
  );
}
