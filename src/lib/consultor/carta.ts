import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { obterPerfil } from "../classificacao/executar";
import type { Db } from "../db";
import { alertas } from "../db/schema";
import { ErroIa, iaDisponivel, modeloDa, obterClienteIa, opcoesDeFallback, registrarUso } from "../ia/cliente";
import { atualizarAlertas, listarAlertasAtivos, montarRetrato } from "./alertas";
import { SKILL_GESTAO_FINANCEIRA } from "./skill";

const EsquemaCarta = z.object({
  titulo: z.string().describe("Uma frase que resume a semana, ex.: 'Semana de segurar gastos: a fatura do Nubank pesa'"),
  resumo: z.string().describe("2 a 4 frases: como estão a empresa e a vida pessoal, com os números que importam"),
  prioridades: z
    .array(z.object({ titulo: z.string(), motivo: z.string().describe("Por que agora, com número"), acao: z.string().describe("O que fazer esta semana, concreto") }))
    .describe("1 a 3 prioridades, da mais importante para a menos"),
  ponto_positivo: z.string().nullable().describe("Algo que melhorou ou está indo bem, se houver"),
});

const SISTEMA = `Você é o consultor financeiro do app "Financeiro PF + PJ" e escreve a carta da semana para o usuário (sócio de uma empresa de serviços no Simples Nacional, com dependentes).

Use só os números do retrato enviado. Seja direto e humano, em português do Brasil, sem jargão. Escolha no máximo 3 prioridades, seguindo a ordem da skill (primeiro o que não pode atrasar, depois caixa, depois dívidas caras, depois reservas e metas). Se os dados forem poucos, diga o que importar para a análise ficar completa.

${SKILL_GESTAO_FINANCEIRA}`;

const reais = (c: number) => Math.round(c) / 100;

/** Gera a carta da semana e a coloca como aviso (abre na janela de avisos). Uma chamada de IA. */
export async function gerarCartaSemanal(db: Db): Promise<number> {
  if (!iaDisponivel()) throw new ErroIa("Configure a ANTHROPIC_API_KEY para gerar a carta da semana.");
  await atualizarAlertas(db);
  const [r, avisos, perfil] = await Promise.all([montarRetrato(db), listarAlertasAtivos(db, { limite: 15 }), obterPerfil(db)]);
  const menorSaldo = (lado: "PF" | "PJ") => {
    const s = r.fluxo.semanas.reduce((m, w) => (w[lado].saldo < m[lado].saldo ? w : m), r.fluxo.semanas[0]);
    return s ? { semana: s.inicio, saldo: reais(s[lado].saldo) } : null;
  };
  const retrato = {
    hoje: r.hoje,
    mes_fechado: r.mesFechado,
    empresa_mes_fechado: Object.fromEntries(Object.entries(r.pjFechado).map(([k, v]) => [k, typeof v === "number" && !/margem|peso|distribuido/.test(k) ? reais(v) : v])),
    pessoal_mes_fechado: Object.fromEntries(Object.entries(r.pfFechado).map(([k, v]) => [k, typeof v === "number" && !/taxa|comprometimento/.test(k) ? reais(v) : v])),
    saldos: { pf: reais(r.saldos.PF), pj: reais(r.saldos.PJ), contas_sem_saldo: r.saldos.contasSemSaldo },
    custo_mensal_medio: { empresa: reais(r.custoPjMensal), pessoal: reais(r.custoPfMensal) },
    renda_pf_media: reais(r.rendaPfMedia),
    menor_saldo_previsto_13_semanas: { pj: menorSaldo("PJ"), pf: menorSaldo("PF") },
    a_pagar_proximos_dias: r.aPagar.map((p) => ({ descricao: p.descricao, valor: reais(p.valorCentavos), vencimento: p.vencimento, status: p.status })),
    dividas: r.dividas.map((d) => ({ nome: d.nome, restante: reais(d.restanteCentavos), parcela: reais(d.parcelaMensalCentavos), atraso_dias: d.diasAtraso, juros_mes: d.taxaMensal })),
    cartoes: r.cartoes.map((c) => ({ cartao: c.conta.apelido, fatura_aberta: c.faturaAberta ? reais(c.faturaAberta.valorCentavos) : null, parcelado_a_vencer: reais(c.parceladoAVencerCentavos), encargos_3m: reais(c.encargos3mCentavos) })),
    a_receber: { vencido: reais(r.recebiveis.vencidoCentavos), proximos_30_dias: reais(r.recebiveis.aReceber30dCentavos) },
    avisos_ativos: avisos.filter((a) => a.tipo !== "carta").map((a) => ({ gravidade: a.gravidade, titulo: a.titulo, mensagem: a.mensagem })),
    contas_sem_extrato_recente: r.contasParadas.map((c) => c.apelido),
  };

  const modelo = modeloDa("carta");
  const resposta = await obterClienteIa().beta.messages.parse({
    model: modelo,
    max_tokens: 8000,
    ...opcoesDeFallback(modelo),
    output_config: { effort: "medium", format: betaZodOutputFormat(EsquemaCarta) },
    system: SISTEMA,
    messages: [{ role: "user", content: `${perfil ? `Sobre o usuário: ${perfil}\n\n` : ""}Retrato da semana (JSON):\n${JSON.stringify(retrato)}` }],
  });
  await registrarUso("carta", modelo, resposta.usage);
  if (resposta.stop_reason === "refusal") throw new ErroIa("A IA não gerou a carta desta vez.");
  const carta = resposta.parsed_output;
  if (!carta) throw new ErroIa("A carta não veio no formato esperado.");

  const prioridades = carta.prioridades
    .slice(0, 3)
    .map((p, i) => `${i + 1}. ${p.titulo} — ${p.motivo} → ${p.acao}`)
    .join("\n");
  const mensagem = carta.ponto_positivo ? `${carta.resumo}\n\nIndo bem: ${carta.ponto_positivo}` : carta.resumo;
  const [linha] = await db
    .insert(alertas)
    .values({
      chave: `carta:${r.hoje}`,
      tipo: "carta",
      gravidade: "info",
      titulo: `Carta da semana: ${carta.titulo}`,
      mensagem,
      recomendacao: prioridades,
      link: "/avisos",
      pergunta: "Sobre a carta da semana: por onde eu começo?",
    })
    .onConflictDoUpdate({
      target: alertas.chave,
      set: { titulo: `Carta da semana: ${carta.titulo}`, mensagem, recomendacao: prioridades, status: "ativo", vistoEm: null, atualizadoEm: new Date() },
    })
    .returning({ id: alertas.id });
  return linha.id;
}

/** Se a última carta tem 7 dias ou mais (ou nunca houve), gera outra. Usado pelo agendador. */
export async function cartaSemanalSeNecessario(db: Db): Promise<boolean> {
  const seteDias = new Date(Date.now() - 7 * 86_400_000 + 3_600_000);
  const recente = await db
    .select({ id: alertas.id })
    .from(alertas)
    .where(and(eq(alertas.tipo, "carta"), gte(alertas.criadoEm, seteDias)))
    .orderBy(desc(alertas.criadoEm))
    .limit(1);
  if (recente.length > 0) return false;
  // Só de manhã em diante (horário de Brasília), para a carta chegar com os dados do dia anterior.
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  if (hora < 7) return false;
  await gerarCartaSemanal(db);
  return true;
}
