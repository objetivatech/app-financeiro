/** Textos do bot (puros: recebem os dados e devolvem HTML no formato do Telegram). */
import { formatarData, formatarMes, formatarMoeda } from "../formato";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const m = formatarMoeda;

/** Markdown simples do consultor → HTML do Telegram (negrito, itálico, código, títulos e listas). */
export function markdownParaTelegram(md: string): string {
  return esc(md)
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n");
}

export const AJUDA = [
  "<b>Financeiro PF + PJ</b> — o que eu faço:",
  "",
  "/resumo — o mês: resultado, empresa, você, caixa",
  "/saldo — saldo de cada conta",
  "/pagar — o que vence nos próximos 7 dias (e o atrasado)",
  "/impostos — próximo DAS e INSS (dia 20)",
  "/avisos — os avisos do consultor",
  "",
  "📎 <b>Mande um PDF, OFX, CSV ou foto</b> de extrato ou fatura: eu importo.",
  "💬 <b>Escreva uma pergunta</b> (ex.: “quanto gastei com delivery este mês?”): o consultor responde com os seus dados.",
  "",
  "Todo dia de manhã eu aviso o que vence hoje e amanhã, e os avisos urgentes chegam assim que aparecem.",
].join("\n");

export function textoResumo(d: {
  mes: string;
  resultado: number;
  ficouNaEmpresa: number;
  sobrouParaVoce: number;
  receitaPJ: number;
  caixa: number;
  aReceber: number;
  posicaoLiquida: number;
  avisosAtivos: number;
}): string {
  const sinal = (v: number) => (v < 0 ? "🔴" : "🟢");
  return [
    `<b>Resumo de ${esc(formatarMes(d.mes))}</b> (até agora)`,
    "",
    `${sinal(d.resultado)} Resultado (você + empresa): <b>${m(d.resultado)}</b>`,
    `🏢 Ficou na empresa: ${m(d.ficouNaEmpresa)} · receita ${m(d.receitaPJ)}`,
    `👤 Sobrou para você: ${m(d.sobrouParaVoce)}`,
    "",
    `💰 Caixa (saldos conhecidos): ${m(d.caixa)}`,
    `📥 A receber em 30 dias: ${m(d.aReceber)}`,
    `📊 Posição líquida: <b>${m(d.posicaoLiquida)}</b>`,
    d.avisosAtivos ? `\n⚠️ ${d.avisosAtivos} aviso(s) ativo(s) — /avisos` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function textoSaldos(contas: { apelido: string; escopo: string; saldoCentavos: number | null; ate: string | null }[]): string {
  if (contas.length === 0) return "Nenhuma conta ativa ainda.";
  const linhas = contas.map((c) =>
    c.saldoCentavos === null
      ? `• ${esc(c.apelido)} (${c.escopo}): <i>sem saldo no extrato</i>`
      : `• ${esc(c.apelido)} (${c.escopo}): <b>${m(c.saldoCentavos)}</b>${c.ate ? ` <i>em ${formatarData(c.ate)}</i>` : ""}`,
  );
  const soma = (escopo: (e: string) => boolean) => contas.filter((c) => escopo(c.escopo)).reduce((t, c) => t + (c.saldoCentavos ?? 0), 0);
  return [
    "<b>Saldos</b> (último extrato de cada conta)",
    "",
    ...linhas,
    "",
    `Empresa: <b>${m(soma((e) => e === "PJ"))}</b> · Você: <b>${m(soma((e) => e !== "PJ"))}</b>`,
  ].join("\n");
}

export function textoAPagar(itens: { descricao: string; valorCentavos: number; vencimento: string; status: string; escopo: string }[], hoje: string): string {
  if (itens.length === 0) return "Nada a pagar nos próximos 7 dias. 🎉";
  const total = itens.reduce((t, i) => t + i.valorCentavos, 0);
  const linhas = itens.map((i) => {
    const quando = i.vencimento < hoje ? "⛔ venceu" : i.vencimento === hoje ? "❗ hoje" : formatarData(i.vencimento);
    return `• ${quando} — ${esc(i.descricao)} (${i.escopo}): <b>${m(i.valorCentavos)}</b>`;
  });
  return [`<b>A pagar</b> (atrasado e próximos 7 dias): ${m(total)}`, "", ...linhas].join("\n");
}

export function textoImpostos(c: { competencia: string; vencimento: string; dasCentavos: number | null; inssCentavos: number; anexo: string | null; aliquotaEfetiva: number | null } | null, andamento: { competencia: string; vencimento: string; total: number } | null): string {
  const partes: string[] = ["<b>Impostos (vencem dia 20)</b>", ""];
  if (c) {
    const das = c.dasCentavos ?? 0;
    partes.push(
      `Competência ${esc(formatarMes(c.competencia))}, vence <b>${formatarData(c.vencimento)}</b>:`,
      `• DAS: <b>${c.dasCentavos === null ? "valor fixo do MEI" : m(das)}</b>${c.anexo ? ` (Anexo ${c.anexo}, ${((c.aliquotaEfetiva ?? 0) * 100).toFixed(2).replace(".", ",")}%)` : ""}`,
      `• INSS do pró-labore: <b>${m(c.inssCentavos)}</b>`,
      `Total: <b>${m(das + c.inssCentavos)}</b>`,
    );
  } else partes.push("Nada pendente da competência passada.");
  if (andamento) partes.push("", `${esc(formatarMes(andamento.competencia))} (em andamento) já soma ${m(andamento.total)} para ${formatarData(andamento.vencimento)}.`);
  partes.push("", "<i>Estimativa pelas notas emitidas; o oficial é o PGDAS-D.</i>");
  return partes.join("\n");
}

const ICONE = { critico: "🔴", atencao: "🟠", info: "🔵" } as const;

export function textoAvisos(avisos: { gravidade: "info" | "atencao" | "critico"; titulo: string; mensagem: string; recomendacao?: string | null }[]): string {
  if (avisos.length === 0) return "Nenhum aviso ativo. 👍";
  return [
    `<b>Avisos do consultor</b> (${avisos.length})`,
    ...avisos.slice(0, 8).map((a) => `\n${ICONE[a.gravidade]} <b>${esc(a.titulo)}</b>\n${esc(a.mensagem)}${a.recomendacao ? `\n→ ${esc(a.recomendacao)}` : ""}`),
    avisos.length > 8 ? `\n…e mais ${avisos.length - 8} no app.` : "",
  ].join("\n");
}

export function textoBomDia(hoje: string, vencendo: { descricao: string; valorCentavos: number; vencimento: string }[], atrasados: number): string | null {
  if (vencendo.length === 0 && atrasados === 0) return null;
  const linhas = vencendo.map((i) => `• ${i.vencimento === hoje ? "hoje" : "amanhã"} — ${esc(i.descricao)}: <b>${m(i.valorCentavos)}</b>`);
  return [
    "☀️ <b>Bom dia! Para pagar:</b>",
    ...linhas,
    atrasados ? `\n⛔ ${atrasados} conta(s) atrasada(s) — /pagar` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
