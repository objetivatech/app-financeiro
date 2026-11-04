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
export function parcelasFuturas(lancadas: ParcelaLancada[], desde: string): ParcelaFutura[] {
  const ultima = new Map<string, ParcelaLancada>();
  for (const p of lancadas) {
    if (p.valorCentavos >= 0 || p.parcelaTotal <= 1 || p.parcelaAtual < 1 || p.parcelaAtual > p.parcelaTotal) continue;
    const chave = `${p.contaId}|${chaveDaCompra(p.descricaoNormalizada)}|${p.valorCentavos}|${p.parcelaTotal}`;
    const atual = ultima.get(chave);
    if (!atual || p.parcelaAtual > atual.parcelaAtual) ultima.set(chave, p);
  }
  const futuras: ParcelaFutura[] = [];
  for (const p of ultima.values()) {
    const [, , dia] = partes(p.vencimentoFatura);
    for (let n = p.parcelaAtual + 1; n <= p.parcelaTotal; n++) {
      const vencimento = somarMeses(p.vencimentoFatura, n - p.parcelaAtual, dia);
      if (vencimento < desde) continue;
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
