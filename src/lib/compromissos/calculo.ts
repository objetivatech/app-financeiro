/**
 * Cálculos puros (sem banco) de parcelas, custo de dívidas e conciliação.
 * Valores em centavos; datas em AAAA-MM-DD.
 */
import { parseData, parseValorCentavos } from "../importacao/util";

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Datas mensais a partir do primeiro vencimento, no mesmo dia do mês.
 * Quando o mês não tem o dia (ex.: 31 em fevereiro), usa o último dia do mês.
 */
export function vencimentosMensais(primeiro: string, quantidade: number, dia?: number): string[] {
  const [ano, mes, d] = primeiro.split("-").map(Number);
  const diaBase = dia ?? d;
  const datas: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const alvo = new Date(Date.UTC(ano, mes - 1 + i, 1));
    const a = alvo.getUTCFullYear();
    const m = alvo.getUTCMonth() + 1;
    const diaReal = Math.min(diaBase, ultimoDiaDoMes(a, m));
    datas.push(`${a}-${String(m).padStart(2, "0")}-${String(diaReal).padStart(2, "0")}`);
  }
  return datas;
}

export interface ParcelaPlanejada {
  numero: number;
  vencimento: string;
  valorCentavos: number;
}

/**
 * Lê parcelas digitadas uma por linha: "05/11/2026 228,82" (data e valor, em qualquer ordem
 * de separador: espaço, ponto-e-vírgula ou tabulação). Linhas inválidas são devolvidas em `erros`.
 */
export function lerParcelasDigitadas(texto: string): { parcelas: ParcelaPlanejada[]; erros: string[] } {
  const parcelas: ParcelaPlanejada[] = [];
  const erros: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const partes = linha.split(/[;\t]|\s+/).filter(Boolean);
    const data = partes.map((p) => parseData(p)).find(Boolean) ?? null;
    const valor = partes
      .filter((p) => !parseData(p))
      .map((p) => parseValorCentavos(p))
      .find((v) => v !== null && v > 0) ?? null;
    if (!data || !valor) {
      erros.push(linha);
      continue;
    }
    parcelas.push({ numero: 0, vencimento: data, valorCentavos: valor });
  }
  parcelas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  parcelas.forEach((p, i) => (p.numero = i + 1));
  return { parcelas, erros };
}

export function parcelasFixas(primeiroVencimento: string, quantidade: number, valorCentavos: number): ParcelaPlanejada[] {
  return vencimentosMensais(primeiroVencimento, quantidade).map((vencimento, i) => ({ numero: i + 1, vencimento, valorCentavos }));
}

/**
 * Taxa de juros mensal efetiva de uma dívida: a taxa que faz o valor presente das parcelas
 * (descontadas mês a mês) igualar o valor recebido. Resolve por bisseção; null se não fizer sentido.
 */
export function taxaMensal(valorRecebidoCentavos: number, parcelas: { vencimento: string; valorCentavos: number }[], dataInicio?: string): number | null {
  if (valorRecebidoCentavos <= 0 || parcelas.length === 0) return null;
  const total = parcelas.reduce((s, p) => s + p.valorCentavos, 0);
  if (total <= valorRecebidoCentavos) return 0;
  const base = Date.parse((dataInicio ?? parcelas[0].vencimento) + "T12:00:00Z");
  // Meses (fracionários) entre o início e cada vencimento; sem data de início, a 1ª parcela vence em 1 mês.
  const meses = parcelas.map((p) => (Date.parse(p.vencimento + "T12:00:00Z") - base) / (30.4375 * 86_400_000) + (dataInicio ? 0 : 1));
  const vp = (r: number) => parcelas.reduce((s, p, i) => s + p.valorCentavos / Math.pow(1 + r, Math.max(meses[i], 0)), 0);
  let baixo = 0;
  let alto = 1; // 100% ao mês já é absurdo; se não bastar, devolve o teto.
  if (vp(alto) > valorRecebidoCentavos) return alto;
  for (let i = 0; i < 100; i++) {
    const meio = (baixo + alto) / 2;
    if (vp(meio) > valorRecebidoCentavos) baixo = meio;
    else alto = meio;
  }
  return (baixo + alto) / 2;
}

/** Converte taxa mensal em anual equivalente. */
export function taxaAnual(mensal: number): number {
  return Math.pow(1 + mensal, 12) - 1;
}

export interface CompromissoParaConciliar {
  id: number;
  valorCentavos: number;
  vencimento: string;
  contaId: number | null;
  padraoExtrato: string | null;
}

export interface TransacaoParaConciliar {
  id: number;
  data: string;
  valorCentavos: number;
  contaId: number;
  descricaoNormalizada: string;
}

const JANELA_DIAS = 7;
/** Contas fixas variam um pouco (ex.: conta de luz); dívidas costumam ser exatas. */
const TOLERANCIA_VALOR = 0.05;

function dias(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/**
 * Casa compromissos a pagar com saídas do extrato. Critérios: saída (valor negativo) com valor
 * igual (ou até 5% de diferença quando há padrão de descrição), até 7 dias do vencimento, na conta
 * do compromisso quando ela é conhecida. Cada transação paga no máximo um compromisso.
 */
export function casarPagamentos(
  compromissos: CompromissoParaConciliar[],
  transacoes: TransacaoParaConciliar[],
): { compromissoId: number; transacaoId: number }[] {
  const usadas = new Set<number>();
  const pares: { compromissoId: number; transacaoId: number }[] = [];
  const ordenados = [...compromissos].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  for (const c of ordenados) {
    const candidatas = transacoes
      .filter((t) => {
        if (usadas.has(t.id) || t.valorCentavos >= 0) return false;
        if (c.contaId !== null && t.contaId !== c.contaId) return false;
        if (dias(t.data, c.vencimento) > JANELA_DIAS) return false;
        const valor = -t.valorCentavos;
        const casaPadrao = c.padraoExtrato ? t.descricaoNormalizada.includes(c.padraoExtrato) : false;
        if (valor === c.valorCentavos) return c.padraoExtrato ? casaPadrao : true;
        return casaPadrao && Math.abs(valor - c.valorCentavos) <= c.valorCentavos * TOLERANCIA_VALOR;
      })
      .sort((a, b) => dias(a.data, c.vencimento) - dias(b.data, c.vencimento));
    const escolhida = candidatas[0];
    if (escolhida) {
      usadas.add(escolhida.id);
      pares.push({ compromissoId: c.id, transacaoId: escolhida.id });
    }
  }
  return pares;
}
