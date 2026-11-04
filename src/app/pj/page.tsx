import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarrasMensais } from "@/components/barras-mensais";
import { AvisosDoPainel } from "@/components/avisos-painel";
import { LinkAjuda } from "@/components/link-ajuda";
import { ListaCategorias } from "@/components/lista-categorias";
import { ResumoDividasCartoes } from "@/components/resumo-dividas-cartoes";
import { SeletorMes } from "@/components/seletor-mes";
import { Cartao, Carregando, Indicador, LinhaValor, Valor } from "@/components/ui";
import { obterDb } from "@/lib/db";
import { formatarMes, formatarMeses, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { mesDeReferencia } from "@/lib/visoes/consultas";
import { dadosPainelPJ } from "@/lib/visoes/paineis";

type Busca = Promise<Record<string, string | string[] | undefined>>;

export default function PainelPJ({ searchParams }: { searchParams: Busca }) {
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
  const d = await dadosPainelPJ(db, mes);
  const a = d.atual;
  const fatorR = d.fiscal.mesesComDados > 0 && d.fiscal.perfil.proLaboreMensalCentavos > 0 ? d.fiscal.diagnostico : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-pj">Empresa (PJ)</span> · {formatarMes(mes)} <LinkAjuda secao="painel-pj" />
          </h1>
          <p className="text-sm text-suave">O negócio olhado sozinho: quanto gera, quanto custa, quanto vai para você e quanto fica.</p>
        </div>
        <SeletorMes caminho="/pj" mes={mes} />
      </div>

      <Suspense fallback={null}>
        <AvisosDoPainel escopo="PJ" limite={3} />
      </Suspense>

      {d.pendencias.semEscopo > 0 && (
        <p className="rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm">
          ⚠ {d.pendencias.semEscopo} lançamento(s) do mês sem PF/PJ ficaram fora destas contas.{" "}
          <Link href={`/transacoes?mes=${mes}&escopo=sem`} className="underline">Classificar</Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Receita do mês"
          valor={formatarMoeda(a.receitaTotal)}
          detalhe={<>média de 3 meses: {formatarMoeda(d.receitaMedia)}</>}
        />
        <Indicador
          rotulo="Margem (resultado ÷ receita)"
          valor={formatarPercentual(a.margem)}
          detalhe={<>resultado: {formatarMoeda(a.resultadoOperacional)}</>}
          tom={a.margem === null ? undefined : a.margem >= 0.2 ? "bom" : a.margem >= 0 ? "atencao" : "ruim"}
        />
        <Indicador
          rotulo="Reserva da empresa"
          valor={formatarMeses(d.reservaMeses)}
          detalhe={<>caixa {formatarMoeda(d.saldo)} ÷ custo mensal {formatarMoeda(d.custoMensal)}</>}
          tom={d.reservaMeses === null ? undefined : d.reservaMeses >= 3 ? "bom" : d.reservaMeses >= 1 ? "atencao" : "ruim"}
        />
        <Indicador
          rotulo="Foi para você"
          valor={formatarPercentual(a.distribuido, 0)}
          detalhe={a.distribuido === null ? "a empresa não teve resultado no mês" : "do resultado do mês"}
          tom={a.distribuido === null ? (a.paraOSocio > 0 ? "ruim" : undefined) : a.distribuido > 1 ? "ruim" : a.distribuido > 0.8 ? "atencao" : "bom"}
        />
        <Indicador
          rotulo="Peso dos impostos"
          valor={formatarPercentual(a.pesoImpostos)}
          detalhe={<>pagos no mês: {formatarMoeda(a.impostos)}</>}
        />
        <Indicador
          rotulo="Dias de caixa"
          valor={d.diasDeCaixa === null ? "—" : `${d.diasDeCaixa} dias`}
          detalhe="quanto tempo o caixa paga os custos sem nova receita"
          tom={d.diasDeCaixa === null ? undefined : d.diasDeCaixa >= 90 ? "bom" : d.diasDeCaixa >= 30 ? "atencao" : "ruim"}
        />
        <Indicador
          rotulo="A receber em 30 dias"
          valor={formatarMoeda(d.recebiveis.aReceber30dCentavos)}
          detalhe={<>vencido: {formatarMoeda(d.recebiveis.vencidoCentavos)} · inadimplência {formatarPercentual(d.recebiveis.inadimplencia)}</>}
          tom={d.recebiveis.vencidoCentavos > 0 ? "atencao" : undefined}
          href="/receber"
        />
        <Indicador
          rotulo={fatorR ? `Fator R · Anexo ${fatorR.anexo}` : "Fator R"}
          valor={fatorR ? formatarPercentual(fatorR.fatorR) : "—"}
          detalhe={fatorR ? <>meta: 28% · DAS estimado {formatarMoeda(fatorR.dasEstimadoCentavos)}</> : "informe o pró-labore em Configurações"}
          tom={fatorR ? (fatorR.fatorR >= 0.28 ? "bom" : "ruim") : undefined}
          href="/impostos"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Cartao titulo={<>Resultado do mês (DRE gerencial) <LinkAjuda secao="dre" /></>}>
          <div className="text-sm">
            <LinhaValor rotulo="Receita de serviços" centavos={a.receitaServicos} />
            {a.outrasReceitas !== 0 && <LinhaValor rotulo="Outras receitas" centavos={a.outrasReceitas} />}
            <LinhaValor rotulo="(−) Impostos" centavos={-a.impostos} nivel={1} />
            <LinhaValor rotulo="(−) Despesas da operação" centavos={-a.despesas} nivel={1} />
            <LinhaValor rotulo="(−) Parcelas de dívidas" centavos={-a.parcelasDividas} nivel={1} />
            <LinhaValor rotulo="Resultado antes de pagar você" centavos={a.resultadoOperacional} destaque sinal />
            <LinhaValor rotulo="(−) Pró-labore" centavos={-a.proLabore} nivel={1} />
            <LinhaValor rotulo="(−) Distribuição de lucros" centavos={-a.lucros} nivel={1} />
            {a.retiradas > 0 && <LinhaValor rotulo="(−) Retiradas a definir" centavos={-a.retiradas} nivel={1} />}
            {a.pessoalNaPj > 0 && <LinhaValor rotulo="(−) Gastos pessoais pagos pela empresa" centavos={-a.pessoalNaPj} nivel={1} />}
            {a.aportes > 0 && <LinhaValor rotulo="(+) Aportes e gastos pagos por você" centavos={a.aportes} nivel={1} />}
            <LinhaValor rotulo="Ficou na empresa" centavos={a.ficouNaEmpresa} destaque sinal />
            {a.investido !== 0 && <p className="mt-1 text-xs text-suave">Aplicado em investimentos no mês: {formatarMoeda(a.investido)}.</p>}
          </div>
        </Cartao>
        <ListaCategorias titulo="Despesas da empresa por categoria" cor="pj" linhas={d.categorias} mes={mes} escopo="PJ" />
      </div>

      <Cartao titulo="Últimos 6 meses">
        <div className="grid gap-6 md:grid-cols-3">
          <BarrasMensais titulo="Receita" cor="pj" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.receitaTotal }))} />
          <BarrasMensais titulo="Resultado antes de pagar você" cor="pj" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.resultadoOperacional }))} />
          <BarrasMensais titulo="Foi para você" cor="pf" dados={d.serie.map((s) => ({ mes: s.mes, valor: s.paraOSocio }))} />
        </div>
      </Cartao>

      <ResumoDividasCartoes dividas={d.dividas} cartoes={d.cartoes} />
      <p className="text-xs text-suave">
        Custo mensal da empresa (média de 3 meses, com pró-labore): <Valor centavos={d.custoMensal} />. Regime de caixa: conta o que
        entrou e saiu das contas no mês; compras no cartão da empresa contam na data da compra.
      </p>
    </div>
  );
}
