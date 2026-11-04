/**
 * Inteligência interna do app: regras que olham cada transação e o fluxo do dinheiro e dizem o que
 * está acontecendo e o que fazer, seguindo a skill de gestão financeira. Gratuitas (sem IA),
 * explicáveis e testáveis: tudo aqui é puro, sobre um "retrato" montado em alertas.ts.
 */
import type { ResumoCartao } from "../cartoes/servico";
import { chaveDoEstabelecimento } from "../classificacao/enriquecimento";
import type { ItemAPagar, LembretePendente, ResumoDivida, SemanaFluxo } from "../compromissos/servico";
import type { ResumoRecebiveis } from "../fiscal/indicadores";
import type { DiagnosticoFatorR } from "../fiscal/simples";
import { formatarData, formatarMes, formatarMeses, formatarMoeda, formatarPercentual } from "../formato";
import type { VisaoPF, VisaoPJ } from "../visoes/calculo";
import { REFERENCIAS as R } from "./referencias";

export type Gravidade = "info" | "atencao" | "critico";

export interface AlertaDetectado {
  chave: string;
  tipo: string;
  gravidade: Gravidade;
  escopo: "PF" | "PJ" | null;
  titulo: string;
  mensagem: string;
  recomendacao: string | null;
  link: string | null;
  pergunta: string | null;
  transacaoId: number | null;
}

export interface TransacaoRetrato {
  id: number;
  contaId: number;
  contaApelido: string;
  contaTipo: string;
  data: string;
  descricao: string;
  descricaoNormalizada: string;
  valorCentavos: number;
  escopo: "PF" | "PJ" | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  natureza: string;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  /** Final do cartão (físico, virtual ou adicional) que fez a compra, quando a fatura informa. */
  finalCartao?: string | null;
}

export interface Retrato {
  hoje: string;
  /** Último mês completo (base dos indicadores mensais). */
  mesFechado: string;
  pjFechado: VisaoPJ;
  pfFechado: VisaoPF;
  /** Custo de vida + parcelas dos 3 meses anteriores ao mês fechado (para comparar). */
  custoDeVidaAnteriores: number[];
  /** Médias de 3 meses (até o mês fechado). */
  custoPjMensal: number;
  custoPfMensal: number;
  rendaPfMedia: number;
  saldos: { PF: number; PJ: number; contasSemSaldo: number };
  dividas: ResumoDivida[];
  cartoes: ResumoCartao[];
  recebiveis: ResumoRecebiveis;
  fiscal: {
    diagnostico: DiagnosticoFatorR;
    mesesComDados: number;
    proLaboreMensalCentavos: number;
    sujeitoFatorR: boolean;
    regimeAtual?: "mei" | "simples";
    mesesDeFolha?: number;
    fatorRPleno?: number;
    folhaCompletaEm?: string | null;
  } | null;
  fluxo: { semanas: SemanaFluxo[]; contasSemSaldo: number };
  aPagar: ItemAPagar[];
  lembretes: LembretePendente[];
  /** Últimos ~150 dias de transações (as regras por transação olham os últimos 45). */
  transacoes: TransacaoRetrato[];
  contasParadas: { id: number; apelido: string; ultima: string }[];
  /** Cartões virtuais/adicionais cancelados (para avisar de assinaturas presas neles). */
  vinculadosCancelados?: { contaId: number; contaApelido: string; apelido: string; final: string; canceladoEm: string | null }[];
  paraRevisar: number;
}

const DIAS_RECENTES = 45;
const ENCARGOS = /\b(JUROS|IOF|MULTA|MORA|ENCARGOS?|ROTATIVO|ANUIDADE|CHEQUE ESPECIAL|LIMITE DA CONTA)\b/;
const NATUREZAS_GASTO = new Set(["comum", "despesa_pessoal_na_pj", "despesa_pj_na_pf"]);
const CATEGORIAS_FORA_DO_PADRAO = new Set(["pf_dividas", "pj_dividas", "pj_impostos", "pf_impostos"]);

function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const m = (centavos: number) => formatarMoeda(centavos);

function alerta(a: Partial<AlertaDetectado> & Pick<AlertaDetectado, "chave" | "tipo" | "gravidade" | "titulo" | "mensagem">): AlertaDetectado {
  return { escopo: null, recomendacao: null, link: null, pergunta: null, transacaoId: null, ...a };
}

/** Regras por transação (o que acabou de acontecer). */
export function regrasDeTransacoes(r: Retrato): AlertaDetectado[] {
  const saida: AlertaDetectado[] = [];
  const limiteRecente = somarDias(r.hoje, -DIAS_RECENTES);
  const recentes = r.transacoes.filter((t) => t.data >= limiteRecente);
  const linkMes = (t: TransacaoRetrato) => `/transacoes?mes=${t.data.slice(0, 7)}&q=${encodeURIComponent(t.descricao.slice(0, 30))}`;

  for (const t of recentes) {
    const valor = Math.abs(t.valorCentavos);
    const quando = `${formatarData(t.data)}, ${t.contaApelido}`;
    if (t.natureza === "despesa_pessoal_na_pj") {
      saida.push(
        alerta({
          chave: `tx:mistura_pf:${t.id}`,
          tipo: "mistura",
          gravidade: "atencao",
          escopo: "PJ",
          titulo: "Gasto pessoal pago pela empresa",
          mensagem: `${t.descricao} (${m(valor)}) saiu da conta da empresa (${quando}).`,
          recomendacao:
            "Pague gastos pessoais pela conta PF. Para este, combine com a contabilidade: tratar como retirada (lucro ou pró-labore) ou devolver o valor à empresa. Se foi engano de classificação, corrija na transação.",
          link: linkMes(t),
          pergunta: `Paguei ${t.descricao} (${m(valor)}) com a conta da empresa. Como devo tratar isso?`,
          transacaoId: t.id,
        }),
      );
    } else if (t.natureza === "despesa_pj_na_pf") {
      saida.push(
        alerta({
          chave: `tx:mistura_pj:${t.id}`,
          tipo: "mistura",
          gravidade: "info",
          escopo: "PF",
          titulo: "Gasto da empresa pago com dinheiro pessoal",
          mensagem: `${t.descricao} (${m(valor)}) é da empresa, mas saiu da sua conta pessoal (${quando}).`,
          recomendacao:
            "Guarde a nota fiscal no CNPJ e peça o reembolso pela conta da empresa (ou registre como aporte). Assim a despesa conta para a empresa e o seu dinheiro volta.",
          link: linkMes(t),
          pergunta: `Paguei ${t.descricao} da empresa com dinheiro pessoal. Reembolso ou aporte?`,
          transacaoId: t.id,
        }),
      );
    } else if (t.natureza === "retirada_socio" && t.valorCentavos < 0) {
      saida.push(
        alerta({
          chave: `tx:retirada:${t.id}`,
          tipo: "retirada",
          gravidade: "atencao",
          escopo: "PJ",
          titulo: "Retirada sem definição",
          mensagem: `${m(valor)} saíram da empresa para você em ${formatarData(t.data)} e ainda não estão marcados como pró-labore ou lucro.`,
          recomendacao:
            "Defina na transação: pró-labore (salário fixo do sócio, com 11% de INSS e que conta para o Fator R) ou distribuição de lucros (isenta de IR quando há lucro apurado). O ideal é um pró-labore fixo por mês e lucros em datas combinadas com a contabilidade.",
          link: `/transacoes?mes=${t.data.slice(0, 7)}&revisar=1`,
          pergunta: `Essa retirada de ${m(valor)} deve ser pró-labore ou distribuição de lucros?`,
          transacaoId: t.id,
        }),
      );
    }

    // Nova compra parcelada relevante.
    if (t.valorCentavos < 0 && t.parcelaAtual === 1 && (t.parcelaTotal ?? 0) >= 3 && valor * t.parcelaTotal! >= 50_000) {
      const fim = formatarMes(new Date(Date.UTC(Number(t.data.slice(0, 4)), Number(t.data.slice(5, 7)) - 1 + t.parcelaTotal!, 1)).toISOString().slice(0, 7));
      saida.push(
        alerta({
          chave: `tx:parcelada:${t.id}`,
          tipo: "parcelada",
          gravidade: "info",
          escopo: t.escopo,
          titulo: "Nova compra parcelada",
          mensagem: `${t.descricao}: ${t.parcelaTotal}× de ${m(valor)} (total ${m(valor * t.parcelaTotal!)}) no ${t.contaApelido}, até ${fim}.`,
          recomendacao: `Cada parcela ocupa a renda dos próximos meses. Mantenha o total de parcelas abaixo de ${formatarPercentual(R.comprometimentoSaudavel, 0)} da renda e prefira parcelar só sem juros.`,
          link: "/cartoes",
          pergunta: `Essa compra parcelada de ${m(valor * t.parcelaTotal!)} cabe no meu orçamento?`,
          transacaoId: t.id,
        }),
      );
    }
  }

  // Juros, IOF, multas e tarifas: um aviso por conta e mês.
  const encargos = new Map<string, { conta: string; contaId: number; mes: string; total: number; itens: string[]; escopo: "PF" | "PJ" | null }>();
  for (const t of recentes) {
    if (t.valorCentavos >= 0 || !ENCARGOS.test(t.descricaoNormalizada) || t.natureza === "pagamento_fatura") continue;
    const k = `${t.contaId}:${t.data.slice(0, 7)}`;
    const e = encargos.get(k) ?? { conta: t.contaApelido, contaId: t.contaId, mes: t.data.slice(0, 7), total: 0, itens: [], escopo: t.escopo };
    e.total += -t.valorCentavos;
    if (e.itens.length < 3) e.itens.push(t.descricao);
    encargos.set(k, e);
  }
  for (const e of encargos.values()) {
    if (e.total < 500) continue;
    saida.push(
      alerta({
        chave: `encargos:${e.contaId}:${e.mes}`,
        tipo: "encargos",
        gravidade: "atencao",
        escopo: e.escopo,
        titulo: "Juros, multas ou tarifas que dá para evitar",
        mensagem: `${m(e.total)} em encargos no ${e.conta} em ${formatarMes(e.mes)} (${e.itens.join("; ")}).`,
        recomendacao:
          "Pague faturas e contas até o vencimento e sempre o total do cartão (rotativo e mínimo são os juros mais caros). Tarifa de pacote e anuidade costumam ser negociáveis ou zeradas trocando de plano.",
        link: `/transacoes?mes=${e.mes}`,
        pergunta: `Paguei ${m(e.total)} de juros e tarifas no ${e.conta}. Como evitar?`,
      }),
    );
  }

  // Gasto fora do padrão da categoria.
  for (const t of recentes) {
    if (t.valorCentavos >= 0 || !t.categoriaId || !NATUREZAS_GASTO.has(t.natureza) || CATEGORIAS_FORA_DO_PADRAO.has(t.categoriaId)) continue;
    if (t.parcelaTotal && t.parcelaTotal > 1) continue;
    const historico = r.transacoes
      .filter((h) => h.categoriaId === t.categoriaId && h.escopo === t.escopo && h.valorCentavos < 0 && h.data < t.data && h.id !== t.id)
      .map((h) => -h.valorCentavos);
    if (historico.length < 4) continue;
    const base = mediana(historico);
    const valor = -t.valorCentavos;
    if (valor >= Math.max(base * 3, 30_000)) {
      saida.push(
        alerta({
          chave: `tx:atipico:${t.id}`,
          tipo: "atipico",
          gravidade: "info",
          escopo: t.escopo,
          titulo: `Gasto acima do normal em ${t.categoriaNome ?? "uma categoria"}`,
          mensagem: `${t.descricao}: ${m(valor)} em ${formatarData(t.data)} — o normal nessa categoria é cerca de ${m(Math.round(base))}.`,
          recomendacao: "Se foi planejado, tudo certo. Se não, vale entender o que aconteceu e se vai se repetir.",
          link: linkMes(t),
          pergunta: `Gastei ${m(valor)} em ${t.descricao}, bem acima do normal. Isso compromete meu mês?`,
          transacaoId: t.id,
        }),
      );
    }
  }

  // Cobranças recorrentes novas e que ficaram mais caras (assinaturas, mensalidades).
  const grupos = new Map<string, TransacaoRetrato[]>();
  for (const t of r.transacoes) {
    if (t.valorCentavos >= 0 || !NATUREZAS_GASTO.has(t.natureza) || (t.parcelaTotal ?? 0) > 1) continue;
    const chave = chaveDoEstabelecimento(t.descricaoNormalizada);
    if (chave.length < 4) continue;
    const k = `${t.escopo ?? ""}|${chave}`;
    grupos.set(k, [...(grupos.get(k) ?? []), t]);
  }
  for (const [k, lista] of grupos) {
    const porMes = new Map<string, TransacaoRetrato>();
    for (const t of [...lista].sort((a, b) => a.data.localeCompare(b.data))) porMes.set(t.data.slice(0, 7), t);
    const mensais = [...porMes.values()];
    if (mensais.length < 2) continue;
    const valores = mensais.map((t) => -t.valorCentavos);
    const base = mediana(valores.slice(0, -1).length ? valores.slice(0, -1) : valores);
    // Recorrente = valores parecidos todo mês.
    const parecidos = valores.every((v) => Math.abs(v - base) <= base * 0.3);
    const ultima = mensais.at(-1)!;
    const nome = k.split("|")[1];
    if (mensais.length === 2 && parecidos && mensais[0].data >= somarDias(r.hoje, -70)) {
      saida.push(
        alerta({
          chave: `recorrente_nova:${k}`,
          tipo: "recorrente",
          gravidade: "info",
          escopo: ultima.escopo,
          titulo: "Nova cobrança recorrente",
          mensagem: `${ultima.descricao} apareceu em dois meses seguidos (${m(-ultima.valorCentavos)}). Parece uma assinatura ou mensalidade nova.`,
          recomendacao: "Se for útil, cadastre como conta fixa em A pagar para entrar no fluxo de caixa. Se não reconhece, cancele ou conteste.",
          link: "/pagar",
          pergunta: `Vale a pena manter ${nome} (${m(-ultima.valorCentavos)} por mês)?`,
          transacaoId: ultima.id,
        }),
      );
    }
    // Assinatura cobrada num cartão virtual que você cancelou: a próxima cobrança vai falhar.
    const cancelado = (r.vinculadosCancelados ?? []).find((v) => v.contaId === ultima.contaId && v.final === ultima.finalCartao);
    if (cancelado && mensais.length >= 2 && ultima.data >= somarDias(r.hoje, -75)) {
      saida.push(
        alerta({
          chave: `virtual_cancelado:${cancelado.contaId}:${cancelado.final}:${k}`,
          tipo: "cartao",
          gravidade: "atencao",
          escopo: ultima.escopo,
          titulo: `Assinatura no cartão virtual cancelado (${cancelado.apelido})`,
          mensagem: `${ultima.descricao} (${m(-ultima.valorCentavos)} por mês) é cobrada no final ${cancelado.final}, que você marcou como cancelado.`,
          recomendacao: "Atualize o cartão nesse serviço (ou cancele a assinatura, se não usa mais) antes da próxima cobrança, para não ter o serviço suspenso.",
          link: "/cartoes",
          pergunta: `Quais assinaturas estavam no cartão virtual final ${cancelado.final}?`,
          transacaoId: ultima.id,
        }),
      );
    }
    if (mensais.length >= 3 && ultima.data >= somarDias(r.hoje, -DIAS_RECENTES)) {
      const anteriores = valores.slice(0, -1);
      const antes = mediana(anteriores);
      const agora = valores.at(-1)!;
      const estavel = anteriores.every((v) => Math.abs(v - antes) <= antes * 0.05);
      if (estavel && agora >= antes * 1.1 && agora - antes >= 500) {
        saida.push(
          alerta({
            chave: `recorrente_aumento:${k}:${ultima.data.slice(0, 7)}`,
            tipo: "recorrente",
            gravidade: "info",
            escopo: ultima.escopo,
            titulo: "Cobrança recorrente ficou mais cara",
            mensagem: `${ultima.descricao} passou de ${m(Math.round(antes))} para ${m(agora)} (+${formatarPercentual(agora / antes - 1, 0)}).`,
            recomendacao: "Confira se o reajuste estava previsto; muitas vezes dá para negociar ou trocar de plano.",
            link: linkMes(ultima),
            pergunta: `${nome} aumentou para ${m(agora)}. Vale negociar ou trocar?`,
            transacaoId: ultima.id,
          }),
        );
      }
    }
  }
  return saida;
}

/** Regras do fluxo (situação geral, compromissos e indicadores). */
export function regrasDoFluxo(r: Retrato): AlertaDetectado[] {
  const saida: AlertaDetectado[] = [];
  const mesAtual = r.hoje.slice(0, 7);

  // Dívidas
  for (const d of r.dividas) {
    if (d.diasAtraso > 0 && d.diasTolerancia) {
      const faltam = d.diasTolerancia - d.diasAtraso;
      saida.push(
        alerta({
          chave: `divida_risco:${d.id}`,
          tipo: "divida",
          gravidade: "critico",
          escopo: d.escopo,
          titulo: `${d.nome}: parcela atrasada há ${d.diasAtraso} dia(s)`,
          mensagem: `${faltam > 0 ? `Faltam ${faltam} dia(s) para o limite de ${d.diasTolerancia}.` : "O limite de atraso já passou."} ${d.consequenciaAtraso ?? ""}`.trim(),
          recomendacao: "Prioridade máxima: pague esta parcela antes de qualquer outra conta que não tenha consequência grave, e guarde o comprovante.",
          link: "/pagar",
          pergunta: `Como priorizo o pagamento atrasado de ${d.nome}?`,
        }),
      );
    } else if (d.diasAtraso > 0) {
      saida.push(
        alerta({
          chave: `divida_atrasada:${d.id}`,
          tipo: "divida",
          gravidade: "atencao",
          escopo: d.escopo,
          titulo: `${d.nome}: parcela atrasada há ${d.diasAtraso} dia(s)`,
          mensagem: d.proximaParcela ? `Parcela de ${m(d.proximaParcela.valorCentavos)} vencida em ${formatarData(d.proximaParcela.vencimento)}.` : "Há parcela vencida.",
          recomendacao: "Atraso gera multa e juros e, em parcelamentos de imposto, pode cancelar o parcelamento. Pague ou renegocie já. Se já pagou, dê baixa em A pagar.",
          link: "/pagar",
        }),
      );
    }
    if (d.taxaMensal !== null && d.taxaMensal > R.jurosCaroMensal && d.restanteCentavos > 0) {
      saida.push(
        alerta({
          chave: `divida_cara:${d.id}`,
          tipo: "divida",
          gravidade: "atencao",
          escopo: d.escopo,
          titulo: `${d.nome} tem juros altos`,
          mensagem: `Cerca de ${formatarPercentual(d.taxaMensal)} ao mês (${formatarPercentual(Math.pow(1 + d.taxaMensal, 12) - 1, 0)} ao ano). Faltam ${m(d.restanteCentavos)}.`,
          recomendacao: "Pelo método avalanche, todo dinheiro extra vai primeiro para a dívida de maior juro. Pergunte ao credor o desconto para antecipar parcelas e compare com a portabilidade.",
          link: "/pagar#dividas",
          pergunta: `Vale antecipar parcelas de ${d.nome}? Quanto eu economizo?`,
        }),
      );
    }
  }

  // Contas a pagar
  for (const p of r.aPagar) {
    if (p.dividaId) continue; // as dívidas têm aviso próprio
    if (p.status === "vencido") {
      saida.push(
        alerta({
          chave: `pagar_vencida:${p.id}`,
          tipo: "pagar",
          gravidade: "atencao",
          escopo: p.escopo,
          titulo: `Conta vencida: ${p.descricao}`,
          mensagem: `${m(p.valorCentavos)} venceu em ${formatarData(p.vencimento)}.`,
          recomendacao: "Se já pagou, dê baixa em A pagar (ou importe o extrato, que concilia sozinho). Se não, pague hoje para evitar multa e juros.",
          link: "/pagar",
        }),
      );
    } else if (p.vencimento <= somarDias(r.hoje, 3)) {
      saida.push(
        alerta({
          chave: `pagar_proxima:${p.id}`,
          tipo: "pagar",
          gravidade: "info",
          escopo: p.escopo,
          titulo: `Vence ${p.vencimento === r.hoje ? "hoje" : `em ${formatarData(p.vencimento)}`}: ${p.descricao}`,
          mensagem: `${m(p.valorCentavos)}.`,
          link: "/pagar",
        }),
      );
    }
  }
  for (const l of r.lembretes) {
    saida.push(
      alerta({
        chave: `lembrete:${l.compromissoId}`,
        tipo: "lembrete",
        gravidade: "atencao",
        titulo: "Lembrete depois de pagar",
        mensagem: `${l.descricao}: ${l.lembrete}`,
        recomendacao: "Marque como feito em A pagar quando concluir.",
        link: "/pagar",
      }),
    );
  }

  // Fluxo de caixa projetado
  const saldoConhecido = r.fluxo.contasSemSaldo === 0 || r.saldos.PF + r.saldos.PJ !== 0;
  if (saldoConhecido) {
    for (const lado of ["PJ", "PF"] as const) {
      const semana = r.fluxo.semanas.find((s) => s[lado].saldo < 0);
      if (!semana) continue;
      const indice = r.fluxo.semanas.indexOf(semana);
      saida.push(
        alerta({
          chave: `fluxo_negativo:${lado}:${semana.inicio.slice(0, 7)}`,
          tipo: "fluxo",
          gravidade: indice < 4 ? "critico" : "atencao",
          escopo: lado,
          titulo: `${lado === "PJ" ? "Caixa da empresa" : "Seu caixa"} fica negativo em ${formatarData(semana.inicio)}`,
          mensagem: `Pelo que está previsto, o saldo ${lado} chega a ${m(semana[lado].saldo)} na semana de ${formatarData(semana.inicio)}.`,
          recomendacao:
            lado === "PJ"
              ? "Antecipe a cobrança dos clientes, segure gastos adiáveis e evite retiradas até lá. Antecipar recebíveis tem custo: compare com a alternativa."
              : "Adie compras e parcelamentos novos, confira o que dá para renegociar e combine a data do pró-labore com o pagamento das contas.",
          link: "/fluxo",
          pergunta: `Meu caixa ${lado} fica negativo em ${formatarData(semana.inicio)}. O que faço para evitar?`,
        }),
      );
    }
  }

  // Empresa: retiradas acima do resultado e resultado negativo no mês fechado
  const pj = r.pjFechado;
  if (pj.receitaTotal > 0 && pj.resultadoOperacional < 0) {
    saida.push(
      alerta({
        chave: `pj_prejuizo:${r.mesFechado}`,
        tipo: "empresa",
        gravidade: "atencao",
        escopo: "PJ",
        titulo: `A empresa gastou mais do que faturou em ${formatarMes(r.mesFechado)}`,
        mensagem: `Receita de ${m(pj.receitaTotal)} e resultado de ${m(pj.resultadoOperacional)} antes de pagar você.`,
        recomendacao: "Veja as maiores despesas da empresa no painel PJ, cobre o que está vencido e reavalie custos fixos.",
        link: `/pj?mes=${r.mesFechado}`,
        pergunta: `Por que a empresa deu prejuízo em ${formatarMes(r.mesFechado)} e o que corto?`,
      }),
    );
  } else if (pj.distribuido !== null && pj.distribuido > 1) {
    saida.push(
      alerta({
        chave: `socio_acima:${r.mesFechado}`,
        tipo: "empresa",
        gravidade: "atencao",
        escopo: "PJ",
        titulo: "Você tirou mais do que a empresa gerou",
        mensagem: `Em ${formatarMes(r.mesFechado)} foram ${m(pj.paraOSocio)} para você, com resultado de ${m(pj.resultadoOperacional)} (${formatarPercentual(pj.distribuido, 0)}).`,
        recomendacao: "Isso consome o caixa da empresa. Defina um pró-labore fixo que caiba no resultado médio e deixe os lucros para depois de a contabilidade apurar.",
        link: `/pj?mes=${r.mesFechado}`,
        pergunta: "Qual pró-labore e quanto de lucro eu consigo tirar sem descapitalizar a empresa?",
      }),
    );
  }

  // Reservas
  if (r.custoPjMensal > 0) {
    const meses = r.saldos.PJ / r.custoPjMensal;
    if (meses < R.reservaPjMinimaMeses) {
      saida.push(
        alerta({
          chave: `reserva_pj:${mesAtual}`,
          tipo: "reserva",
          gravidade: meses < 0.5 ? "critico" : "atencao",
          escopo: "PJ",
          titulo: "Reserva da empresa abaixo do mínimo",
          mensagem: `O caixa da empresa (${m(r.saldos.PJ)}) cobre ${formatarMeses(meses)} de custo (${m(r.custoPjMensal)}/mês com pró-labore). O mínimo é ${R.reservaPjMinimaMeses} mês; o ideal, ${R.reservaPjIdealMeses}.`,
          recomendacao: "Separe uma parte de cada recebimento para a reserva antes de distribuir lucros, até chegar a 1 mês de custo; depois, a 3 meses.",
          link: "/pj",
          pergunta: "Quanto devo guardar por mês para a reserva da empresa chegar a 3 meses?",
        }),
      );
    }
  }
  if (r.custoPfMensal > 0) {
    const meses = r.saldos.PF / r.custoPfMensal;
    if (meses < R.reservaPfMinimaMeses) {
      saida.push(
        alerta({
          chave: `reserva_pf:${mesAtual}`,
          tipo: "reserva",
          gravidade: meses < 1 ? "critico" : "atencao",
          escopo: "PF",
          titulo: "Reserva de emergência baixa",
          mensagem: `Seu caixa (${m(r.saldos.PF)}) cobre ${formatarMeses(meses)} de custo de vida (${m(r.custoPfMensal)}/mês). Referência: ${R.reservaPfIdealMeses} meses (mínimo ${R.reservaPfMinimaMeses}).`,
          recomendacao: "Antes de metas de consumo (como trocar de carro), forme a reserva: um valor fixo todo mês, logo que o pró-labore cair, numa aplicação de liquidez diária.",
          link: "/pf",
          pergunta: "Em quanto tempo eu formo uma reserva de emergência de 6 meses?",
        }),
      );
    }
  }

  // Comprometimento da renda com parcelas
  if (r.rendaPfMedia > 0) {
    const mesSeguinte = new Date(Date.UTC(Number(mesAtual.slice(0, 4)), Number(mesAtual.slice(5, 7)), 1)).toISOString().slice(0, 7);
    const parcelasDividas = r.dividas.filter((d) => d.escopo === "PF").reduce((s, d) => s + d.parcelaMensalCentavos, 0);
    const parcelasCartao = r.cartoes
      .filter((c) => c.conta.escopoPadrao !== "PJ")
      .reduce((s, c) => s + c.parcelas.filter((p) => p.vencimento.slice(0, 7) === mesSeguinte).reduce((t, p) => t + p.valorCentavos, 0), 0);
    const comprometimento = (parcelasDividas + parcelasCartao) / r.rendaPfMedia;
    if (comprometimento > R.comprometimentoSaudavel) {
      saida.push(
        alerta({
          chave: `comprometimento:${mesAtual}`,
          tipo: "dividas",
          gravidade: comprometimento > R.comprometimentoCritico ? "critico" : "atencao",
          escopo: "PF",
          titulo: "Parcelas comprometem demais a sua renda",
          mensagem: `${m(parcelasDividas + parcelasCartao)} por mês em parcelas = ${formatarPercentual(comprometimento, 0)} da renda média (${m(r.rendaPfMedia)}). Limite saudável: ${formatarPercentual(R.comprometimentoSaudavel, 0)}.`,
          recomendacao: "Não assuma parcelas novas até baixar desse limite. Priorize quitar as dívidas de maior juro e evite parcelar no cartão.",
          link: "/pagar#dividas",
          pergunta: "Como reduzo o peso das parcelas na minha renda?",
        }),
      );
    }
  }

  // Poupança e custo de vida (mês fechado)
  const pf = r.pfFechado;
  if (pf.rendaTotal > 0 && pf.sobra < 0) {
    saida.push(
      alerta({
        chave: `poupanca_negativa:${r.mesFechado}`,
        tipo: "pessoal",
        gravidade: "atencao",
        escopo: "PF",
        titulo: `Você gastou mais do que recebeu em ${formatarMes(r.mesFechado)}`,
        mensagem: `Renda de ${m(pf.rendaTotal)} e ${m(-pf.sobra)} a mais de saídas (custo de vida ${m(pf.custoDeVida)}, parcelas ${m(pf.parcelasDividas)}).`,
        recomendacao: "Veja as maiores categorias no painel PF e escolha 1 ou 2 para cortar já neste mês. A meta é guardar 20% da renda.",
        link: `/pf?mes=${r.mesFechado}`,
        pergunta: `Onde eu corto para voltar a sobrar dinheiro?`,
      }),
    );
  }
  const anteriores = r.custoDeVidaAnteriores.filter((v) => v > 0);
  if (anteriores.length >= 2) {
    const media = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
    const atual = pf.custoDeVida + pf.parcelasDividas;
    if (atual > media * 1.15 && atual - media >= 30_000) {
      saida.push(
        alerta({
          chave: `custo_vida_subiu:${r.mesFechado}`,
          tipo: "pessoal",
          gravidade: "info",
          escopo: "PF",
          titulo: "Custo de vida subiu",
          mensagem: `${formatarMes(r.mesFechado)}: ${m(atual)}, ${formatarPercentual(atual / media - 1, 0)} acima da média dos meses anteriores (${m(Math.round(media))}).`,
          recomendacao: "Compare as categorias mês a mês no painel PF: um gasto pontual tudo bem; um aumento recorrente pede ajuste no orçamento.",
          link: `/pf?mes=${r.mesFechado}`,
          pergunta: "O que fez meu custo de vida subir?",
        }),
      );
    }
  }

  // Fator R (só para quem já está no Simples como ME; MEI paga DAS fixo)
  if (
    r.fiscal &&
    r.fiscal.sujeitoFatorR &&
    r.fiscal.regimeAtual !== "mei" &&
    r.fiscal.mesesComDados >= 6 &&
    r.fiscal.proLaboreMensalCentavos > 0 &&
    r.fiscal.diagnostico.fatorR < R.fatorR
  ) {
    const d = r.fiscal.diagnostico;
    const transicao = r.fiscal.folhaCompletaEm && (r.fiscal.fatorRPleno ?? 0) >= R.fatorR;
    saida.push(
      alerta({
        chave: `fator_r:${mesAtual}`,
        tipo: "imposto",
        gravidade: transicao ? "info" : "atencao",
        escopo: "PJ",
        titulo: transicao
          ? `Fator R em ${formatarPercentual(d.fatorR)} por causa da saída do MEI`
          : `Fator R em ${formatarPercentual(d.fatorR)}: empresa no Anexo V`,
        mensagem: transicao
          ? `A folha tem pró-labore em só ${r.fiscal.mesesDeFolha} dos últimos 12 meses. Com o pró-labore atual nos 12 meses (a partir de ${formatarMes(r.fiscal.folhaCompletaEm!)}), o Fator R seria ${formatarPercentual(r.fiscal.fatorRPleno!)}. DAS estimado do mês: ${m(d.dasEstimadoCentavos)}.`
          : `Com pró-labore de ${m(d.proLaboreMinimoCentavos)} por mês a empresa voltaria ao Anexo III. DAS estimado do mês: ${m(d.dasEstimadoCentavos)} (no Anexo III seria ${m(d.dasNoOutroAnexoCentavos)}).`,
        recomendacao: transicao
          ? "Confirme com a contabilidade como o PGDAS-D está considerando os meses de MEI na folha. Manter o pró-labore todo mês garante o Anexo III quando completar 12 meses."
          : "Compare a economia no DAS com o custo do aumento do pró-labore (11% de INSS + IR na PF) e leve a conta para a contabilidade.",
        link: "/impostos",
        pergunta: transicao ? "Como a saída do MEI afeta meu Fator R e o DAS nos próximos meses?" : "Vale a pena aumentar o pró-labore para voltar ao Anexo III?",
      }),
    );
  }

  // Cartões
  for (const c of r.cartoes) {
    if (!c.conta.diaVencimento || !c.conta.diaFechamento) {
      saida.push(
        alerta({
          chave: `cartao_config:${c.conta.id}`,
          tipo: "cartao",
          gravidade: "info",
          escopo: c.conta.escopoPadrao === "PJ" ? "PJ" : "PF",
          titulo: `Complete o cartão ${c.conta.apelido}`,
          mensagem: "Faltam o dia de fechamento e/ou de vencimento: sem isso, as parcelas futuras podem ficar fora do fluxo de caixa.",
          link: "/cartoes",
        }),
      );
    }
    if (c.conta.limiteCentavos && c.limiteUsadoCentavos / c.conta.limiteCentavos > R.limiteCartaoAlto) {
      saida.push(
        alerta({
          chave: `cartao_limite:${c.conta.id}:${mesAtual}`,
          tipo: "cartao",
          gravidade: "atencao",
          escopo: c.conta.escopoPadrao === "PJ" ? "PJ" : "PF",
          titulo: `Limite do ${c.conta.apelido} quase todo usado`,
          mensagem: `${formatarPercentual(c.limiteUsadoCentavos / c.conta.limiteCentavos, 0)} do limite (${m(c.limiteUsadoCentavos)} de ${m(c.conta.limiteCentavos)}) entre fatura e parcelas.`,
          recomendacao: `Evite compras novas neste cartão até liberar limite; o saudável é usar até ${formatarPercentual(R.limiteCartaoSaudavel, 0)}.`,
          link: "/cartoes",
        }),
      );
    }
  }

  // Recebíveis
  if (r.recebiveis.vencidoQtd > 0) {
    saida.push(
      alerta({
        chave: "receber_vencido",
        tipo: "receber",
        gravidade: "atencao",
        escopo: "PJ",
        titulo: `${r.recebiveis.vencidoQtd} cobrança(s) vencida(s)`,
        mensagem: `${m(r.recebiveis.vencidoCentavos)} a receber já venceram (inadimplência de ${formatarPercentual(r.recebiveis.inadimplencia)}).`,
        recomendacao: "Cobre esta semana: mensagem gentil no dia seguinte ao vencimento, ligação após 7 dias. Para clientes recorrentes, combine cobrança automática.",
        link: "/receber",
        pergunta: "Como organizo a cobrança dos clientes atrasados?",
      }),
    );
  }
  const maior = r.recebiveis.maiorCliente;
  if (maior && maior.participacao > R.concentracaoClienteCritica) {
    saida.push(
      alerta({
        chave: `concentracao:${mesAtual}`,
        tipo: "receber",
        gravidade: "info",
        escopo: "PJ",
        titulo: "Receita muito concentrada em um cliente",
        mensagem: `${maior.nome} responde por ${formatarPercentual(maior.participacao, 0)} da receita dos últimos 12 meses.`,
        recomendacao: "Perder esse cliente afetaria muito o caixa. Reforce a reserva da empresa e busque diversificar a carteira.",
        link: "/receber",
      }),
    );
  }

  // Dados
  for (const c of r.contasParadas) {
    saida.push(
      alerta({
        chave: `sem_extrato:${c.id}:${mesAtual}`,
        tipo: "dados",
        gravidade: "info",
        titulo: `Importe o extrato de ${c.apelido}`,
        mensagem: `O último lançamento é de ${formatarData(c.ultima)}. Sem ele, painéis, fluxo e avisos ficam incompletos.`,
        link: "/importar",
      }),
    );
  }
  if (r.paraRevisar >= 10) {
    saida.push(
      alerta({
        chave: `revisar:${mesAtual}`,
        tipo: "dados",
        gravidade: "info",
        titulo: `${r.paraRevisar} transações esperando revisão`,
        mensagem: "Enquanto não forem revisadas, os totais de PF e PJ podem estar errados.",
        recomendacao: "Reserve 10 minutos: corrija as que estiverem erradas e marque “aplicar a todas que contêm…” para o app aprender.",
        link: "/transacoes?revisar=1",
      }),
    );
  }
  return saida;
}

export function detectarAlertas(r: Retrato): AlertaDetectado[] {
  const todos = [...regrasDoFluxo(r), ...regrasDeTransacoes(r)];
  // Chave repetida (não deveria acontecer): fica a primeira.
  const vistos = new Set<string>();
  return todos.filter((a) => (vistos.has(a.chave) ? false : (vistos.add(a.chave), true)));
}
