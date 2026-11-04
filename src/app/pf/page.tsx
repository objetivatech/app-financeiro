import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { AvisosDoPainel } from "@/components/avisos-painel";
import { LinkAjuda } from "@/components/link-ajuda";
import { ListaCategorias } from "@/components/lista-categorias";
import { ResumoDividasCartoes } from "@/components/resumo-dividas-cartoes";
import { SeletorMes } from "@/components/seletor-mes";
import { Cartao, Carregando, Indicador, LinhaValor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { formatarMes, formatarMeses, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { mesDeReferencia } from "@/lib/visoes/consultas";
import { dadosPainelPF } from "@/lib/visoes/paineis";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PainelPF({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const db = obterDb();
  const mes = await mesDeReferencia(db, (await searchParams).mes);
  const d = await dadosPainelPF(db, mes);
  const a = d.atual;
  const s = d.socio;
  const parcelas = d.parcelasMensais.dividas + d.parcelasMensais.cartoes;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-pf">Pessoal (PF)</span> · {formatarMes(mes)} <LinkAjuda secao="painel-pf" />
          </h1>
          <p className="text-sm text-suave">Sua vida financeira: quanto você recebe (inclusive da empresa), quanto custa viver e quanto sobra.</p>
        </div>
        <SeletorMes caminho="/pf" mes={mes} />
      </div>

      <Suspense fallback={null}>
        <AvisosDoPainel escopo="PF" limite={3} />
      </Suspense>

      {d.pendencias.semEscopo > 0 && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          ⚠ {d.pendencias.semEscopo} lançamento(s) do mês sem PF/PJ ficaram fora destas contas.{" "}
          <Link href={`/transacoes?mes=${mes}&escopo=sem`} className="underline">Classificar</Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Renda do mês" valor={formatarMoeda(a.rendaTotal)} detalhe={<>média de 3 meses: {formatarMoeda(d.rendaMedia)}</>} />
        <Indicador rotulo="Custo de vida" valor={formatarMoeda(a.custoDeVida)} detalhe={<>média com parcelas: {formatarMoeda(d.custoDeVidaMedio)}</>} />
        <Indicador
          rotulo="Taxa de poupança"
          valor={formatarPercentual(a.taxaPoupanca)}
          detalhe={<>sobra {formatarMoeda(a.sobra)} · média 3m {formatarPercentual(d.taxaPoupancaMedia)}</>}
          tom={a.taxaPoupanca === null ? undefined : a.taxaPoupanca >= 0.2 ? "bom" : a.taxaPoupanca >= 0 ? "atencao" : "ruim"}
        />
        <Indicador
          rotulo="Reserva de emergência"
          valor={formatarMeses(d.reservaMeses)}
          detalhe={<>caixa {formatarMoeda(d.saldo)} · ideal: 6 meses</>}
          tom={d.reservaMeses === null ? undefined : d.reservaMeses >= 6 ? "bom" : d.reservaMeses >= 3 ? "atencao" : "ruim"}
        />
        <Indicador
          rotulo="Renda comprometida com parcelas"
          valor={formatarPercentual(d.comprometimento)}
          detalhe={<>{formatarMoeda(parcelas)}/mês · limite saudável: 30%</>}
          tom={d.comprometimento === null ? undefined : d.comprometimento <= 0.3 ? "bom" : d.comprometimento <= 0.4 ? "atencao" : "ruim"}
          href="/pagar"
        />
        <Indicador rotulo="Veio da empresa" valor={formatarMoeda(a.rendaDoNegocio + a.pagoPelaEmpresa)} detalhe="pró-labore, lucros, retiradas e gastos pagos pela PJ" href={`/pj?mes=${mes}`} />
        <Indicador rotulo="Investido no mês" valor={formatarMoeda(a.investido)} detalhe="aplicações − resgates" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Cartao titulo="Resumo do mês">
          <div className="text-sm">
            <LinhaValor rotulo="Pró-labore" centavos={s.proLabore} nivel={1} />
            <LinhaValor rotulo="Distribuição de lucros" centavos={s.lucros} nivel={1} />
            {s.retiradas > 0 && <LinhaValor rotulo="Retiradas a definir" centavos={s.retiradas} nivel={1} />}
            {a.pagoPelaEmpresa > 0 && <LinhaValor rotulo="Gastos pessoais pagos pela empresa" centavos={a.pagoPelaEmpresa} nivel={1} />}
            <LinhaValor rotulo="Outras rendas" centavos={a.outrasRendas} nivel={1} />
            <LinhaValor rotulo="Renda total" centavos={a.rendaTotal} destaque />
            <LinhaValor rotulo="(−) Custo de vida" centavos={-a.custoDeVida} nivel={1} />
            <LinhaValor rotulo="(−) Parcelas de dívidas" centavos={-a.parcelasDividas} nivel={1} />
            {a.paraAEmpresa > 0 && <LinhaValor rotulo="(−) Colocado na empresa / gastos dela" centavos={-a.paraAEmpresa} nivel={1} />}
            <LinhaValor rotulo="Sobrou" centavos={a.sobra} destaque sinal />
          </div>
        </Cartao>
        <ListaCategorias titulo="Para onde foi o dinheiro pessoal" cor="pf" linhas={d.categorias} mes={mes} escopo="PF" />
      </div>

      <Cartao titulo="Últimos 6 meses">
        <div className="grid gap-6 md:grid-cols-3">
          <BarrasMensais titulo="Renda" cor="pf" dados={d.serie.map((x) => ({ mes: x.mes, valor: x.rendaTotal }))} />
          <BarrasMensais titulo="Custo de vida" cor="pf" dados={d.serie.map((x) => ({ mes: x.mes, valor: x.custoDeVida }))} />
          <BarrasMensais titulo="Sobra" cor="pf" dados={d.serie.map((x) => ({ mes: x.mes, valor: x.sobra }))} />
        </div>
      </Cartao>

      <ResumoDividasCartoes dividas={d.dividas} cartoes={d.cartoes} />
    </div>
  );
}
