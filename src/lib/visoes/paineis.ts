import { resumoCartoes, escopoDoCartao, type ResumoCartao } from "../cartoes/servico";
import { atualizarCompromissos, contasAPagar, lembretesPendentes, resumoDividas, saldosConhecidos, type ResumoDivida } from "../compromissos/servico";
import { hojeBrasil } from "../datas";
import type { Db } from "../db";
import { indicadoresFiscais, resumoRecebiveis } from "../fiscal/indicadores";
import { deslocarMes } from "../formato";
import { media, mesesDeCobertura, visaoConsolidada, visaoPF, visaoPJ, type VisaoPF, type VisaoPJ } from "./calculo";
import { gastosPorCategoria, pendenciasDoMes, somasPorMes } from "./consultas";

const MESES_SERIE = 6;

function proximoMes(): string {
  return deslocarMes(hojeBrasil().slice(0, 7), 1);
}

/** Quanto sai por mês com parcelas: dívidas (próxima parcela) + parcelas de cartão do próximo mês. */
function compromissoMensal(dividas: ResumoDivida[], cartoes: ResumoCartao[]): { dividas: number; cartoes: number } {
  const mes = proximoMes();
  return {
    dividas: dividas.reduce((s, d) => s + d.parcelaMensalCentavos, 0),
    cartoes: cartoes.reduce((s, c) => s + c.parcelas.filter((p) => p.vencimento.slice(0, 7) === mes).reduce((t, p) => t + p.valorCentavos, 0), 0),
  };
}

export async function dadosPainelPJ(db: Db, mes: string) {
  await atualizarCompromissos(db);
  const [somas, categorias, saldos, recebiveis, fiscal, dividas, cartoes, pendencias] = await Promise.all([
    somasPorMes(db, deslocarMes(mes, -(MESES_SERIE - 1)), mes),
    gastosPorCategoria(db, "PJ", mes),
    saldosConhecidos(db),
    resumoRecebiveis(db),
    indicadoresFiscais(db),
    resumoDividas(db),
    resumoCartoes(db),
    pendenciasDoMes(db, mes),
  ]);
  const serie = somas.map((s) => ({ mes: s.mes, ...visaoPJ(s) }));
  const atual = serie.at(-1)!;
  const ultimos3 = serie.slice(-3);
  // Quanto a empresa precisa por mês para ficar de pé (inclui o pró-labore, que é o seu salário).
  const custoMensal = media(ultimos3.map((v) => v.impostos + v.despesas + v.parcelasDividas + v.proLabore));
  const dividasPJ = dividas.filter((d) => d.escopo === "PJ");
  const cartoesPJ = cartoes.filter((c) => escopoDoCartao(c.conta) === "PJ");
  return {
    serie,
    atual,
    categorias,
    saldo: saldos.PJ,
    contasSemSaldo: saldos.contasSemSaldo,
    receitaMedia: media(ultimos3.map((v) => v.receitaTotal)),
    resultadoMedio: media(ultimos3.map((v) => v.resultadoOperacional)),
    custoMensal,
    reservaMeses: mesesDeCobertura(saldos.PJ, custoMensal),
    diasDeCaixa: custoMensal > 0 ? Math.floor(saldos.PJ / (custoMensal / 30)) : null,
    recebiveis,
    fiscal,
    dividas: dividasPJ,
    cartoes: cartoesPJ,
    parcelasMensais: compromissoMensal(dividasPJ, cartoesPJ),
    pendencias,
  };
}

export async function dadosPainelPF(db: Db, mes: string) {
  await atualizarCompromissos(db);
  const [somas, categorias, saldos, dividas, cartoes, pendencias] = await Promise.all([
    somasPorMes(db, deslocarMes(mes, -(MESES_SERIE - 1)), mes),
    gastosPorCategoria(db, "PF", mes),
    saldosConhecidos(db),
    resumoDividas(db),
    resumoCartoes(db),
    pendenciasDoMes(db, mes),
  ]);
  const serie = somas.map((s) => ({ mes: s.mes, ...visaoPF(s) }));
  const atual = serie.at(-1)!;
  const ultimos3 = serie.slice(-3);
  const custoDeVidaMedio = media(ultimos3.map((v) => v.custoDeVida + v.parcelasDividas));
  const rendaMedia = media(ultimos3.map((v) => v.rendaTotal));
  const sobraMedia = media(ultimos3.map((v) => v.sobra));
  const dividasPF = dividas.filter((d) => d.escopo === "PF");
  const cartoesPF = cartoes.filter((c) => escopoDoCartao(c.conta) === "PF");
  const parcelas = compromissoMensal(dividasPF, cartoesPF);
  return {
    serie,
    atual,
    categorias,
    saldo: saldos.PF,
    contasSemSaldo: saldos.contasSemSaldo,
    rendaMedia,
    custoDeVidaMedio,
    taxaPoupancaMedia: rendaMedia > 0 ? sobraMedia / rendaMedia : null,
    reservaMeses: mesesDeCobertura(saldos.PF, custoDeVidaMedio),
    /** Do lado da empresa: pró-labore, lucros e retiradas que compõem a sua renda. */
    socio: visaoPJ(somas.at(-1)!),
    parcelasMensais: parcelas,
    comprometimento: rendaMedia > 0 ? (parcelas.dividas + parcelas.cartoes) / rendaMedia : null,
    dividas: dividasPF,
    cartoes: cartoesPF,
    pendencias,
  };
}

export async function dadosConsolidado(db: Db, mes: string) {
  await atualizarCompromissos(db);
  const [somas, saldos, recebiveis, dividas, cartoes, pendencias, aPagar, lembretes] = await Promise.all([
    somasPorMes(db, deslocarMes(mes, -(MESES_SERIE - 1)), mes),
    saldosConhecidos(db),
    resumoRecebiveis(db),
    resumoDividas(db),
    resumoCartoes(db),
    pendenciasDoMes(db, mes),
    contasAPagar(db, 7),
    lembretesPendentes(db),
  ]);
  const serie = somas.map((s) => ({ mes: s.mes, pj: visaoPJ(s), pf: visaoPF(s), total: visaoConsolidada(s) }));
  const atual = serie.at(-1)!;
  const dividasRestantes = dividas.reduce((s, d) => s + d.restanteCentavos, 0);
  // Faturas em aberto + parcelas que ainda vão cair (fora das faturas já conhecidas).
  const cartoesAVencer = cartoes.reduce((s, c) => s + c.limiteUsadoCentavos, 0);
  const caixa = saldos.PF + saldos.PJ;
  return {
    serie,
    atual,
    saldos,
    caixa,
    aReceber: recebiveis.aReceber30dCentavos,
    dividasRestantes,
    cartoesAVencer,
    /** Caixa + a receber em 30 dias − dívidas − cartões: sua posição se tudo fosse acertado hoje. */
    posicaoLiquida: caixa + recebiveis.aReceber30dCentavos - dividasRestantes - cartoesAVencer,
    dividasEmRisco: dividas.filter((d) => d.diasAtraso > 0 && d.diasTolerancia),
    aPagarSemana: aPagar.pendentes,
    lembretes,
    pendencias,
  };
}

/** Nós e ligações do diagrama "para onde foi o dinheiro" no mês. */
export function fluxoDoMes(pj: VisaoPJ, pf: VisaoPF) {
  const deficitPJ = Math.max(0, -pj.ficouNaEmpresa);
  const deficitPF = Math.max(0, -pf.sobra);
  const nos = [
    { id: "clientes", rotulo: "Clientes", coluna: 0, cor: "pj" },
    { id: "aporte", rotulo: "Aportes seus", coluna: 0, cor: "pf" },
    { id: "caixaPJ", rotulo: "Do caixa da empresa", coluna: 0, cor: "neutro" },
    { id: "outras", rotulo: "Outras rendas", coluna: 0, cor: "pf" },
    { id: "caixaPF", rotulo: "Do seu caixa/crédito", coluna: 0, cor: "neutro" },
    { id: "empresa", rotulo: "Empresa", coluna: 1, cor: "pj" },
    { id: "impostos", rotulo: "Impostos", coluna: 2, cor: "neutro" },
    { id: "despesasPJ", rotulo: "Despesas da empresa", coluna: 2, cor: "neutro" },
    { id: "dividasPJ", rotulo: "Dívidas da empresa", coluna: 2, cor: "neutro" },
    { id: "ficou", rotulo: "Ficou na empresa", coluna: 2, cor: "positivo" },
    { id: "voce", rotulo: "Você", coluna: 2, cor: "pf" },
    { id: "vida", rotulo: "Custo de vida", coluna: 3, cor: "neutro" },
    { id: "dividasPF", rotulo: "Dívidas pessoais", coluna: 3, cor: "neutro" },
    { id: "paraEmpresa", rotulo: "Colocado na empresa", coluna: 3, cor: "neutro" },
    { id: "sobrou", rotulo: "Sobrou para você", coluna: 3, cor: "positivo" },
  ] as const;
  const ligacoes = [
    { de: "clientes", para: "empresa", valor: pj.receitaTotal },
    { de: "aporte", para: "empresa", valor: pj.aportes },
    { de: "caixaPJ", para: "empresa", valor: deficitPJ },
    { de: "empresa", para: "impostos", valor: pj.impostos },
    { de: "empresa", para: "despesasPJ", valor: pj.despesas },
    { de: "empresa", para: "dividasPJ", valor: pj.parcelasDividas },
    { de: "empresa", para: "voce", valor: pj.paraOSocio },
    { de: "empresa", para: "ficou", valor: Math.max(0, pj.ficouNaEmpresa) },
    { de: "outras", para: "voce", valor: pf.outrasRendas },
    { de: "caixaPF", para: "voce", valor: deficitPF },
    { de: "voce", para: "vida", valor: pf.custoDeVida },
    { de: "voce", para: "dividasPF", valor: pf.parcelasDividas },
    { de: "voce", para: "paraEmpresa", valor: pf.paraAEmpresa },
    { de: "voce", para: "sobrou", valor: Math.max(0, pf.sobra) },
  ];
  return { nos: [...nos], ligacoes };
}
