import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { obterPerfil } from "../classificacao/executar";
import { resumoDividas } from "../compromissos/servico";
import { despesasPorCategoria, resumoDoPeriodo, type Periodo } from "../consultas";
import { deslocarMes } from "../formato";
import { visaoConsolidada, visaoPF, visaoPJ } from "../visoes/calculo";
import { somasPorMes } from "../visoes/consultas";
import type { Db } from "../db";
import { analises, transacoes } from "../db/schema";
import { ErroIa, modeloDa, obterClienteIa, opcoesDeFallback, registrarUso } from "./cliente";

export const EsquemaAnalise = z.object({
  resumo: z.string().describe("Diagnóstico do período em 3 a 5 frases, direto ao ponto"),
  alertas: z.array(
    z.object({
      titulo: z.string(),
      detalhe: z.string(),
      gravidade: z.enum(["alta", "media", "baixa"]),
    }),
  ),
  dicas: z.array(
    z.object({
      titulo: z.string(),
      detalhe: z.string(),
      acao: z.string().describe("O que fazer esta semana, concreto"),
      economia_mensal_estimada: z.number().nullable().describe("Em reais, se der para estimar com os dados"),
    }),
  ),
  perguntas_para_o_contador: z.array(z.string()),
});

export type Analise = z.infer<typeof EsquemaAnalise>;

const SISTEMA = `Você é um consultor financeiro para pequenos empresários brasileiros. Seu cliente é sócio de uma empresa do Simples Nacional e, como muita gente, mistura as finanças pessoais (PF) com as da empresa (PJ).

Seu trabalho: olhar os números consolidados e dizer o que importa — sem jargão, sem enrolação.

Foque em:
- Separação PF/PJ: gastos pessoais pagos pela empresa, gastos da empresa pagos pela PF, retiradas sem padrão. Mostre o tamanho do problema em reais.
- Quanto a empresa realmente gera (resultado antes de pagar o sócio) versus quanto vai para o sócio. Tirar mais do que a empresa gera é sinal vermelho.
- Do lado pessoal: renda (inclui pró-labore, lucros e retiradas), custo de vida, sobra/taxa de poupança e peso das parcelas de dívidas.
- Dívidas: priorize as que não podem atrasar e as de juros mais altos.
- Custo de vida pessoal e para onde ele vai; assinaturas e gastos recorrentes que podem ser cortados.
- Organização: excesso de contas e cartões, tarifas, juros.
- Pontos tributários do Simples (pró-labore × distribuição de lucros, Fator R, DAS): trate como hipóteses para validar com o contador. Não afirme alíquotas ou regras de que você não tenha certeza; nesses casos, transforme em pergunta para o contador.

Use apenas os números fornecidos. Se os dados forem poucos (ex.: só uma conta importada), diga isso no resumo. Valores em reais.`;

async function recorrentes(db: Db, fim: string) {
  const [ano, mes] = fim.slice(0, 7).split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 3, 1)).toISOString().slice(0, 10);
  return db
    .select({
      descricao: sql<string>`regexp_replace(${transacoes.descricaoNormalizada}, '[0-9/*.-]+', '', 'g')`,
      meses: sql<number>`count(distinct to_char(${transacoes.data}, 'YYYY-MM'))::int`,
      mediaCentavos: sql<number>`(-avg(${transacoes.valorCentavos}))::bigint`,
      escopo: sql<string | null>`max(${transacoes.escopo})`,
    })
    .from(transacoes)
    .where(and(gte(transacoes.data, inicio), lte(transacoes.data, fim), sql`${transacoes.valorCentavos} < 0`, sql`${transacoes.natureza} not in ('transferencia_interna','pagamento_fatura','investimento','retirada_socio','pro_labore','distribuicao_lucros','aporte_socio')`))
    .groupBy(sql`1`)
    .having(sql`count(distinct to_char(${transacoes.data}, 'YYYY-MM')) >= 2`)
    .orderBy(sql`3 desc`)
    .limit(30);
}

async function maioresDespesas(db: Db, p: Periodo) {
  return db
    .select({
      data: transacoes.data,
      descricao: transacoes.descricao,
      valorCentavos: transacoes.valorCentavos,
      escopo: transacoes.escopo,
      natureza: transacoes.natureza,
    })
    .from(transacoes)
    .where(and(gte(transacoes.data, p.inicio), lte(transacoes.data, p.fim), sql`${transacoes.valorCentavos} < 0`, sql`${transacoes.natureza} not in ('transferencia_interna','pagamento_fatura','investimento')`))
    .orderBy(transacoes.valorCentavos)
    .limit(25);
}

const reais = (centavos: number) => Math.round(centavos) / 100;

/** Gera dicas e alertas para o período a partir de dados agregados (não envia o extrato inteiro). */
export async function gerarAnalise(db: Db, p: Periodo): Promise<{ id: number; analise: Analise }> {
  const mes = p.fim.slice(0, 7);
  const [resumo, categorias, somas, recorr, maiores, perfil, contas, dividas] = await Promise.all([
    resumoDoPeriodo(db, p),
    despesasPorCategoria(db, p),
    somasPorMes(db, deslocarMes(mes, -5), mes),
    recorrentes(db, p.fim),
    maioresDespesas(db, p),
    obterPerfil(db),
    db.query.contas.findMany({ columns: { apelido: true, tipo: true, escopoPadrao: true, candidataEncerrar: true } }),
    resumoDividas(db),
  ]);
  const emReais = (o: object) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "number" && !/margem|peso|distribuido|taxa|comprometimento/i.test(k) ? reais(v) : v]));
  if (resumo.total === 0) throw new ErroIa("Não há transações neste período para analisar.");

  const dados = {
    periodo: p,
    perfil_do_usuario: perfil || null,
    pendencias: { sem_pf_pj: resumo.semEscopo, para_revisar: resumo.paraRevisar, transacoes_no_mes: resumo.total },
    // Visões já calculadas pelo app (regras em visoes/calculo.ts): use estes números, não recalcule.
    empresa_pj_em_reais: emReais(visaoPJ(somas.at(-1)!)),
    pessoal_pf_em_reais: emReais(visaoPF(somas.at(-1)!)),
    consolidado_em_reais: emReais(visaoConsolidada(somas.at(-1)!)),
    despesas_por_categoria: categorias.map((c) => ({ categoria: c.nome, escopo: c.escopo, total: reais(c.totalCentavos), qtd: c.quantidade })),
    ultimos_meses: somas.map((s) => {
      const pj = visaoPJ(s);
      const pf = visaoPF(s);
      return {
        mes: s.mes,
        receita_pj: reais(pj.receitaTotal),
        resultado_pj_antes_do_socio: reais(pj.resultadoOperacional),
        foi_para_o_socio: reais(pj.paraOSocio),
        renda_pf: reais(pf.rendaTotal),
        custo_de_vida_pf: reais(pf.custoDeVida),
        sobra_pf: reais(pf.sobra),
      };
    }),
    dividas: dividas.map((d) => ({ nome: d.nome, escopo: d.escopo, restante: reais(d.restanteCentavos), parcela: reais(d.parcelaMensalCentavos), parcelas: `${d.parcelasPagas}/${d.parcelasTotal}`, juros_ao_mes: d.taxaMensal, dias_atraso: d.diasAtraso })),
    gastos_recorrentes: recorr.map((r) => ({ descricao: r.descricao.trim(), meses: r.meses, media: reais(Number(r.mediaCentavos)), escopo: r.escopo })),
    maiores_saidas: maiores.map((m) => ({ data: m.data, descricao: m.descricao, valor: reais(m.valorCentavos), escopo: m.escopo, natureza: m.natureza })),
    contas: contas.map((c) => ({ apelido: c.apelido, tipo: c.tipo, escopo: c.escopoPadrao, candidata_a_encerrar: c.candidataEncerrar })),
  };

  const cliente = obterClienteIa();
  const modelo = modeloDa("analise");
  const resposta = await cliente.beta.messages.parse({
    model: modelo,
    max_tokens: 16000,
    ...opcoesDeFallback(modelo),
    output_config: { effort: "high", format: betaZodOutputFormat(EsquemaAnalise) },
    system: SISTEMA,
    messages: [{ role: "user", content: `Dados do período (JSON):\n${JSON.stringify(dados, null, 1)}` }],
  });
  await registrarUso("analise", modelo, resposta.usage);
  if (resposta.stop_reason === "refusal") throw new ErroIa("A IA recusou gerar a análise.");
  if (!resposta.parsed_output) throw new ErroIa("A IA não devolveu a análise no formato esperado.");

  const [linha] = await db
    .insert(analises)
    .values({ periodoInicio: p.inicio, periodoFim: p.fim, conteudo: JSON.stringify(resposta.parsed_output) })
    .returning({ id: analises.id });
  return { id: linha.id, analise: resposta.parsed_output };
}
