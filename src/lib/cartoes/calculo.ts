/**
 * Cálculos puros de cartão de crédito (sem banco): em que fatura cai uma compra e quais
 * parcelas ainda vão aparecer nas próximas faturas. Datas em AAAA-MM-DD; valores em centavos.
 */
import { vencimentosMensais } from "../compromissos/calculo";

function partes(data: string): [number, number, number] {
  const [a, m, d] = data.split("-").map(Number);
  return [a, m, d];
}

function noDia(ano: number, mes: number, dia: number): string {
  // vencimentosMensais já limita o dia ao último do mês (ex.: 31 em fevereiro).
  return vencimentosMensais(`${ano}-${String(mes).padStart(2, "0")}-01`, 1, dia)[0];
}

/** Soma meses mantendo o dia (limitado ao último dia do mês). */
export function somarMeses(data: string, meses: number, dia?: number): string {
  const [a, m, d] = partes(data);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  return noDia(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, dia ?? d);
}

/**
 * Fatura em que cai uma compra. Convenção dos emissores brasileiros: compras feitas a partir do
 * dia do fechamento já vão para a fatura seguinte. O vencimento é no mesmo mês do fechamento
 * quando o dia de vencimento vem depois do fechamento; senão, no mês seguinte.
 */
export function faturaDaCompra(dataCompra: string, diaFechamento: number, diaVencimento: number): { fechamento: string; vencimento: string } {
  const [a, m] = partes(dataCompra);
  const fechamentoDoMes = noDia(a, m, diaFechamento);
  const fechamento = dataCompra < fechamentoDoMes ? fechamentoDoMes : somarMeses(fechamentoDoMes, 1, diaFechamento);
  const [fa, fm] = partes(fechamento);
  const vencimento = diaVencimento > diaFechamento ? noDia(fa, fm, diaVencimento) : somarMeses(noDia(fa, fm, 1), 1, diaVencimento);
  return { fechamento, vencimento };
}

/** Próximo vencimento a partir de uma data (inclusive), dado o dia de vencimento do cartão. */
export function proximoVencimento(data: string, diaVencimento: number): string {
  const [a, m] = partes(data);
  const nesteMes = noDia(a, m, diaVencimento);
  return nesteMes >= data ? nesteMes : somarMeses(nesteMes, 1, diaVencimento);
}

const MARCAS_PARCELA = [
  /\bPARC(ELA)?\.?\s*\d{1,2}\s*(DE|\/)\s*\d{1,2}\b/g,
  /\b\d{1,2}\s*DE\s*\d{1,2}\b/g,
  /\b\d{1,2}\/\d{1,2}\b/g,
  /[()]/g,
];

/** Identifica a mesma compra parcelada em faturas diferentes (descrição sem o "3/10"). */
export function chaveDaCompra(descricaoNormalizada: string): string {
  let s = descricaoNormalizada;
  for (const r of MARCAS_PARCELA) s = s.replace(r, " ");
  return s.replace(/\s+/g, " ").trim();
}

export interface ParcelaLancada {
  contaId: number;
  descricao: string;
  descricaoNormalizada: string;
  /** Valor da parcela como veio na fatura (negativo = compra). */
  valorCentavos: number;
  parcelaAtual: number;
  parcelaTotal: number;
  /** Vencimento da fatura em que esta parcela foi cobrada. */
  vencimentoFatura: string;
}

export interface ParcelaFutura {
  contaId: number;
  descricao: string;
  numero: number;
  total: number;
  vencimento: string;
  /** Positivo: quanto vai sair. */
  valorCentavos: number;
}

/**
 * Parcelas que ainda vão ser cobradas. Para cada compra (mesma conta, descrição sem a marca de
 * parcela, mesmo valor e mesmo total de parcelas) usa a parcela mais recente já lançada e projeta
 * as restantes nas faturas dos meses seguintes. Só devolve vencimentos a partir de `desde`.
 */
export function parcelasFuturas(lancadas: ParcelaLancada[], desde: string, mesesExcluidos: ReadonlySet<string> = new Set()): ParcelaFutura[] {
  // A mesma compra aparece em várias faturas com a descrição lida de jeitos diferentes e, às vezes,
  // a 1ª parcela com centavos a mais. O que não muda é o mês da compra (vencimento − parcela) e o
  // total de parcelas: dentro disso, junta pelo valor parecido (até 1%) ou pela mesma descrição.
  const grupos = new Map<string, { chave: string; valor: number; p: ParcelaLancada }[]>();
  for (const p of lancadas) {
    if (p.valorCentavos >= 0 || p.parcelaTotal <= 1 || p.parcelaAtual < 1 || p.parcelaAtual > p.parcelaTotal) continue;
    const origem = somarMeses(p.vencimentoFatura, -(p.parcelaAtual - 1), 1).slice(0, 7);
    const grupo = `${p.contaId}|${p.parcelaTotal}|${origem}`;
    const lista = grupos.get(grupo) ?? [];
    const chave = chaveDaCompra(p.descricaoNormalizada);
    const mesma = lista.find((x) => x.chave === chave || Math.abs(x.valor - p.valorCentavos) <= Math.max(2, Math.abs(x.valor) * 0.01));
    if (!mesma) lista.push({ chave, valor: p.valorCentavos, p });
    else if (p.parcelaAtual > mesma.p.parcelaAtual) mesma.p = p;
    grupos.set(grupo, lista);
  }
  const futuras: ParcelaFutura[] = [];
  for (const { p } of [...grupos.values()].flat()) {
    const [, , dia] = partes(p.vencimentoFatura);
    for (let n = p.parcelaAtual + 1; n <= p.parcelaTotal; n++) {
      const vencimento = somarMeses(p.vencimentoFatura, n - p.parcelaAtual, dia);
      // Meses com fatura já conhecida: a parcela está dentro dela, não conta de novo.
      if (vencimento < desde || mesesExcluidos.has(vencimento.slice(0, 7))) continue;
      futuras.push({ contaId: p.contaId, descricao: p.descricao, numero: n, total: p.parcelaTotal, vencimento, valorCentavos: -p.valorCentavos });
    }
  }
  return futuras.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao));
}

/** Soma por mês (AAAA-MM) das parcelas futuras de um cartão. */
export function totalPorMes(parcelas: ParcelaFutura[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const p of parcelas) mapa.set(p.vencimento.slice(0, 7), (mapa.get(p.vencimento.slice(0, 7)) ?? 0) + p.valorCentavos);
  return mapa;
}

// ---------------------------------------------------------------------------------------------
// Situação das faturas: o que foi pago de cada uma, inclusive em várias vezes.
// ---------------------------------------------------------------------------------------------

/** Diferença até R$ 1,00 conta como quitada (arredondamentos, IOF de centavos). */
export const TOLERANCIA_FATURA = 100;

export interface FaturaParaSituacao {
  id: number;
  vencimento: string;
  fechamento: string | null;
  valorCentavos: number;
  /** Você marcou como paga (data informada). */
  pagaEm: string | null;
}

export interface PagamentoDeFatura {
  data: string;
  /** Positivo: quanto foi pago. */
  valorCentavos: number;
  /** "cartao": o crédito que aparece na fatura; "conta": a saída no extrato da conta que paga. */
  fonte: "cartao" | "conta";
  transacaoId: number;
}

export type StatusFatura = "paga" | "parcial" | "aberta" | "vencida" | "rolada";

export interface SituacaoFatura {
  id: number;
  status: StatusFatura;
  pagoCentavos: number;
  /** Quanto falta (0 se paga). Numa fatura "rolada", é o que passou para a fatura seguinte. */
  restanteCentavos: number;
  /** Data do último pagamento considerado (ou a data que você marcou). */
  pagaEm: string | null;
  pagamentos: PagamentoDeFatura[];
}

/** Fechamento conhecido ou estimado: o último dia de fechamento antes do vencimento (senão, 7 dias antes). */
export function fechamentoEstimado(f: Pick<FaturaParaSituacao, "vencimento" | "fechamento">, diaFechamento: number | null): string {
  if (f.fechamento) return f.fechamento;
  if (!diaFechamento) return somarMeses(f.vencimento, 0, Math.max(1, partes(f.vencimento)[2] - 7));
  const mesmoMes = somarMeses(f.vencimento, 0, diaFechamento);
  return mesmoMes < f.vencimento ? mesmoMes : somarMeses(f.vencimento, -1, diaFechamento);
}

/**
 * O que foi pago de cada fatura. Regras (como os cartões funcionam):
 * - Paga a fatura F o que entra entre o fechamento dela e o fechamento da seguinte. Pagamentos
 *   antes do fechamento já estão dentro do total de F (como crédito); a sobra vira crédito na próxima.
 * - Pagamento em várias vezes soma. A mesma quantia vista nos dois lados (crédito na fatura e saída
 *   na conta) não conta em dobro: em cada período vale o lado com o maior total.
 * - Só a fatura mais recente pode estar em aberto: depois que a seguinte fecha, o que faltou já foi
 *   cobrado nela (saldo anterior + juros), então a anterior vira "rolada", e não uma segunda dívida.
 */
export function situacaoDasFaturas(
  faturasDoCartao: FaturaParaSituacao[],
  pagamentos: PagamentoDeFatura[],
  opcoes: { diaFechamento: number | null; hoje: string },
): SituacaoFatura[] {
  const ordenadas = [...faturasDoCartao].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const fechamentos = ordenadas.map((f) => fechamentoEstimado(f, opcoes.diaFechamento));
  return ordenadas.map((f, i) => {
    const inicio = fechamentos[i];
    const fim = i + 1 < ordenadas.length ? fechamentos[i + 1] : "9999-12-31";
    const doPeriodo = pagamentos.filter((p) => p.data > inicio && p.data <= fim).sort((a, b) => a.data.localeCompare(b.data));
    const soma = (fonte: PagamentoDeFatura["fonte"]) => doPeriodo.filter((p) => p.fonte === fonte).reduce((t, p) => t + p.valorCentavos, 0);
    const fonte: PagamentoDeFatura["fonte"] = soma("cartao") >= soma("conta") ? "cartao" : "conta";
    const usados = doPeriodo.filter((p) => p.fonte === fonte);
    const pago = usados.reduce((t, p) => t + p.valorCentavos, 0);
    const total = Math.max(0, f.valorCentavos);
    const ultima = i === ordenadas.length - 1;
    if (f.pagaEm) return { id: f.id, status: "paga", pagoCentavos: Math.max(pago, total), restanteCentavos: 0, pagaEm: f.pagaEm, pagamentos: usados };
    const restante = Math.max(0, total - pago);
    // Quitada no pagamento que completou o valor (os seguintes viram crédito na próxima fatura).
    let acumulado = 0;
    const quitouEm = usados.find((p) => (acumulado += p.valorCentavos) >= total - TOLERANCIA_FATURA)?.data ?? null;
    let status: StatusFatura;
    if (restante <= TOLERANCIA_FATURA) status = "paga";
    // Rola quando a fatura seguinte já fechou (o saldo foi cobrado nela).
    else if (!ultima && fim <= opcoes.hoje) status = "rolada";
    else if (pago > 0) status = "parcial";
    else status = f.vencimento < opcoes.hoje ? "vencida" : "aberta";
    return {
      id: f.id,
      status,
      pagoCentavos: Math.min(pago, total),
      restanteCentavos: status === "paga" ? 0 : restante,
      pagaEm: status === "paga" ? (quitouEm ?? f.vencimento) : null,
      pagamentos: usados,
    };
  });
}
