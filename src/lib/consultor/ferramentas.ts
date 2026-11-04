/**
 * Ferramentas do consultor (chat): consultas aos dados do app e simulações. A IA não recebe o banco
 * inteiro: pede o que precisa, e cada ferramenta devolve um resumo em reais, sem CPF/CNPJ nem
 * número de conta.
 */
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { resumoCartoes } from "../cartoes/servico";
import { chaveDoEstabelecimento } from "../classificacao/enriquecimento";
import { fluxoProjetado, resumoDividas } from "../compromissos/servico";
import { hojeBrasil, somarDias } from "../datas";
import type { Db } from "../db";
import { categorias, contas, transacoes } from "../db/schema";
import { indicadoresFiscais, resumoRecebiveis } from "../fiscal/indicadores";
import { gastosPorCategoria } from "../visoes/consultas";
import { dadosConsolidado, dadosPainelPF, dadosPainelPJ } from "../visoes/paineis";
import { listarAlertasAtivos } from "./alertas";
import { simularFinanciamento, simularMeta, simularProLabore, simularQuitacao } from "./simulacoes";

const reais = (centavos: number | null | undefined) => (centavos === null || centavos === undefined ? null : Math.round(centavos) / 100);
const centavos = (r: number) => Math.round(r * 100);
const pct = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);

/** Tira CPF, CNPJ e sequências longas de números (contas, cartões) das descrições. */
export function mascararDocumentos(texto: string): string {
  return texto
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\d{8,}/g, "[número]");
}

/** Converte objetos com campos em centavos para reais (chaves terminadas em "Centavos"). */
function emReais(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(emReais);
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => (k.endsWith("Centavos") && typeof v === "number" ? [k.replace(/Centavos$/, "_reais"), reais(v)] : [k, emReais(v)])),
    );
  }
  return valor;
}

const json = (dados: unknown) => JSON.stringify(emReais(dados));
const mes = z.string().regex(/^\d{4}-\d{2}$/).describe("Mês AAAA-MM");

/** Executa a ferramenta e transforma erro em texto (o consultor explica em vez de travar). */
async function seguro(f: () => Promise<string>): Promise<string> {
  try {
    return await f();
  } catch (erro) {
    return JSON.stringify({ erro: erro instanceof Error ? erro.message : String(erro) });
  }
}

export function ferramentasDoConsultor(db: Db) {
  const hoje = () => hojeBrasil();
  return [
    betaZodTool({
      name: "panorama_do_mes",
      description:
        "Visões já calculadas pelo app para um mês: empresa (DRE gerencial, margem, reserva, dias de caixa, Fator R), pessoal (renda, custo de vida, sobra, taxa de poupança, reserva de emergência, comprometimento com parcelas) e consolidado (resultado, posição líquida). Use primeiro para qualquer pergunta sobre a situação.",
      inputSchema: z.object({ mes: mes.optional().describe("Padrão: mês atual") }),
      run: ({ mes: m }) =>
        seguro(async () => {
          const alvo = m ?? hoje().slice(0, 7);
          const [pj, pf, c] = await Promise.all([dadosPainelPJ(db, alvo), dadosPainelPF(db, alvo), dadosConsolidado(db, alvo)]);
          return json({
            mes: alvo,
            observacao: alvo === hoje().slice(0, 7) ? "Mês em andamento: valores parciais." : undefined,
            empresa: {
              ...pj.atual,
              saldoCentavos: pj.saldo,
              custoMensalMedioCentavos: pj.custoMensal,
              receitaMedia3mCentavos: pj.receitaMedia,
              reservaMeses: pj.reservaMeses,
              diasDeCaixa: pj.diasDeCaixa,
              fatorR: pj.fiscal.mesesComDados > 0 ? pj.fiscal.diagnostico.fatorR : null,
              anexo: pj.fiscal.diagnostico.anexo,
            },
            pessoal: {
              ...pf.atual,
              saldoCentavos: pf.saldo,
              rendaMedia3mCentavos: pf.rendaMedia,
              custoDeVidaMedio3mCentavos: pf.custoDeVidaMedio,
              taxaPoupancaMedia3m: pf.taxaPoupancaMedia,
              reservaMeses: pf.reservaMeses,
              comprometimentoComParcelas: pf.comprometimento,
            },
            consolidado: { ...c.atual.total, caixaCentavos: c.caixa, aReceber30dCentavos: c.aReceber, dividasRestantesCentavos: c.dividasRestantes, cartoesAVencerCentavos: c.cartoesAVencer, posicaoLiquidaCentavos: c.posicaoLiquida },
            serie6m: pj.serie.map((s, i) => ({ mes: s.mes, receitaPjCentavos: s.receitaTotal, resultadoPjCentavos: s.resultadoOperacional, paraOSocioCentavos: s.paraOSocio, rendaPfCentavos: pf.serie[i].rendaTotal, custoDeVidaCentavos: pf.serie[i].custoDeVida, sobraPfCentavos: pf.serie[i].sobra })),
          });
        }),
    }),
    betaZodTool({
      name: "gastos_por_categoria",
      description: "Gastos de um mês por categoria, para PF ou PJ (valores positivos; estornos abatidos).",
      inputSchema: z.object({ escopo: z.enum(["PF", "PJ"]), mes: mes.optional() }),
      run: ({ escopo, mes: m }) => seguro(async () => json(await gastosPorCategoria(db, escopo, m ?? hoje().slice(0, 7)))),
    }),
    betaZodTool({
      name: "buscar_transacoes",
      description: "Busca transações por texto, categoria, escopo, período e valor. Devolve no máximo 60, das mais recentes. Valores negativos são saídas.",
      inputSchema: z.object({
        texto: z.string().optional().describe("Trecho da descrição, ex.: ifood"),
        categoriaId: z.string().optional().describe("Ex.: pf_alimentacao, pj_marketing"),
        escopo: z.enum(["PF", "PJ"]).optional(),
        de: z.string().optional().describe("AAAA-MM-DD"),
        ate: z.string().optional().describe("AAAA-MM-DD"),
        valorMinimoReais: z.number().optional().describe("Valor absoluto mínimo"),
        limite: z.number().int().min(1).max(60).optional(),
      }),
      run: (f) =>
        seguro(async () => {
          const cond: SQL[] = [];
          if (f.texto) cond.push(ilike(transacoes.descricao, `%${f.texto}%`));
          if (f.categoriaId) cond.push(eq(transacoes.categoriaId, f.categoriaId));
          if (f.escopo) cond.push(eq(transacoes.escopo, f.escopo));
          if (f.de) cond.push(gte(transacoes.data, f.de));
          if (f.ate) cond.push(lte(transacoes.data, f.ate));
          if (f.valorMinimoReais) cond.push(sql`abs(${transacoes.valorCentavos}) >= ${centavos(f.valorMinimoReais)}`);
          const linhas = await db
            .select({
              data: transacoes.data,
              descricao: transacoes.descricao,
              valorCentavos: transacoes.valorCentavos,
              escopo: transacoes.escopo,
              categoria: categorias.nome,
              natureza: transacoes.natureza,
              conta: contas.apelido,
              parcela: sql<string | null>`case when ${transacoes.parcelaTotal} is not null then ${transacoes.parcelaAtual} || '/' || ${transacoes.parcelaTotal} end`,
            })
            .from(transacoes)
            .innerJoin(contas, eq(contas.id, transacoes.contaId))
            .leftJoin(categorias, eq(categorias.id, transacoes.categoriaId))
            .where(cond.length ? and(...cond) : undefined)
            .orderBy(desc(transacoes.data))
            .limit(f.limite ?? 40);
          const lista = linhas.map((l) => ({ ...l, descricao: mascararDocumentos(l.descricao), valorCentavos: Number(l.valorCentavos) }));
          return json({ quantidade: lista.length, totalCentavos: lista.reduce((s, l) => s + l.valorCentavos, 0), transacoes: lista });
        }),
    }),
    betaZodTool({
      name: "gastos_recorrentes",
      description: "Cobranças que se repetem todo mês (assinaturas, mensalidades, contas) nos últimos 4 meses, com o valor médio.",
      inputSchema: z.object({ escopo: z.enum(["PF", "PJ"]).optional() }),
      run: ({ escopo }) =>
        seguro(async () => {
          const linhas = await db
            .select({ data: transacoes.data, descricao: transacoes.descricao, descricaoNormalizada: transacoes.descricaoNormalizada, valor: transacoes.valorCentavos, escopo: transacoes.escopo })
            .from(transacoes)
            .where(and(gte(transacoes.data, somarDias(hoje(), -125)), sql`${transacoes.valorCentavos} < 0`, sql`${transacoes.natureza} in ('comum','despesa_pessoal_na_pj','despesa_pj_na_pf')`, escopo ? eq(transacoes.escopo, escopo) : undefined));
          const grupos = new Map<string, { descricao: string; escopo: string | null; meses: Set<string>; total: number; n: number }>();
          for (const l of linhas) {
            const k = chaveDoEstabelecimento(l.descricaoNormalizada);
            if (k.length < 4) continue;
            const g = grupos.get(k) ?? { descricao: mascararDocumentos(l.descricao), escopo: l.escopo, meses: new Set<string>(), total: 0, n: 0 };
            g.meses.add(l.data.slice(0, 7));
            g.total += -Number(l.valor);
            g.n++;
            grupos.set(k, g);
          }
          const recorrentes = [...grupos.values()]
            .filter((g) => g.meses.size >= 3)
            .map((g) => ({ descricao: g.descricao, escopo: g.escopo, meses: g.meses.size, mediaMensalCentavos: Math.round(g.total / g.meses.size) }))
            .sort((a, b) => b.mediaMensalCentavos - a.mediaMensalCentavos);
          return json({ recorrentes, totalMensalCentavos: recorrentes.reduce((s, r) => s + r.mediaMensalCentavos, 0) });
        }),
    }),
    betaZodTool({
      name: "dividas",
      description: "Dívidas cadastradas: restante, parcelas, próxima parcela, atraso, tolerância e juros ao mês estimados.",
      inputSchema: z.object({}),
      run: () => seguro(async () => json(await resumoDividas(db))),
    }),
    betaZodTool({
      name: "cartoes",
      description: "Cartões de crédito: fatura em aberto, parcelas a vencer, limite usado, encargos dos últimos 3 meses e projeção das próximas faturas.",
      inputSchema: z.object({}),
      run: () =>
        seguro(async () =>
          json(
            (await resumoCartoes(db)).map((c) => ({
              cartao: c.conta.apelido,
              escopo: c.conta.escopoPadrao,
              limiteCentavos: c.conta.limiteCentavos,
              faturaAberta: c.faturaAberta,
              parceladoAVencerCentavos: c.parceladoAVencerCentavos,
              limiteUsadoCentavos: c.limiteUsadoCentavos,
              mediaAVistaCentavos: c.mediaAVistaCentavos,
              encargos3mCentavos: c.encargos3mCentavos,
              projecao: c.projecao,
              parcelas: c.parcelas.slice(0, 20).map((p) => ({ ...p, descricao: mascararDocumentos(p.descricao) })),
            })),
          ),
        ),
    }),
    betaZodTool({
      name: "fluxo_de_caixa",
      description: "Projeção semana a semana das próximas 13 semanas (PF e PJ) a partir do saldo conhecido e dos compromissos cadastrados.",
      inputSchema: z.object({}),
      run: () => seguro(async () => json(await fluxoProjetado(db, 13))),
    }),
    betaZodTool({
      name: "impostos_e_recebiveis",
      description: "Fator R, anexo, alíquota efetiva, DAS estimado, pró-labore mínimo, receita dos últimos 13 meses e contas a receber (vencido, inadimplência, maior cliente).",
      inputSchema: z.object({}),
      run: () =>
        seguro(async () => {
          const [f, r] = await Promise.all([indicadoresFiscais(db), resumoRecebiveis(db)]);
          return json({
            proLaboreCadastradoCentavos: f.perfil.proLaboreMensalCentavos,
            fonteDaReceita: f.fonte,
            mesesComDados: f.mesesComDados,
            receitaMensal: f.receitaMensal,
            diagnostico: { ...f.diagnostico, fatorR: pct(f.diagnostico.fatorR), aliquotaEfetiva: pct(f.diagnostico.aliquotaEfetiva) },
            recebiveis: r,
          });
        }),
    }),
    betaZodTool({
      name: "avisos_ativos",
      description: "Avisos que a inteligência interna do app já identificou (o que está acontecendo e o que fazer).",
      inputSchema: z.object({}),
      run: () =>
        seguro(async () => json((await listarAlertasAtivos(db, { limite: 30 })).map((a) => ({ gravidade: a.gravidade, escopo: a.escopo, titulo: a.titulo, mensagem: a.mensagem, recomendacao: a.recomendacao })))),
    }),
    betaZodTool({
      name: "simular_financiamento",
      description:
        "Simula um financiamento (ex.: carro) pela Tabela Price e avalia contra as referências (entrada ≥ 20%, parcela ≤ 15% da renda, total de parcelas ≤ 30%). Informe a renda mensal e as parcelas atuais (use panorama_do_mes e dividas). Pode incluir seguro, IPVA (RS ≈ 3% ao ano), manutenção e combustível para o custo mensal total.",
      inputSchema: z.object({
        valorBemReais: z.number().positive(),
        entradaReais: z.number().min(0),
        taxaMensalPercentual: z.number().min(0).describe("Ex.: 1.8 para 1,8% ao mês (use o CET quando souber)"),
        meses: z.number().int().min(1).max(120),
        rendaMensalReais: z.number().optional(),
        parcelasAtuaisReais: z.number().optional(),
        seguroAnualReais: z.number().optional(),
        ipvaAnualPercentual: z.number().optional().describe("Ex.: 3 para 3% ao ano"),
        manutencaoMensalReais: z.number().optional(),
        combustivelMensalReais: z.number().optional(),
      }),
      run: (p) =>
        seguro(async () =>
          json(
            simularFinanciamento({
              valorBemCentavos: centavos(p.valorBemReais),
              entradaCentavos: centavos(p.entradaReais),
              taxaMensal: p.taxaMensalPercentual / 100,
              meses: p.meses,
              rendaMensalCentavos: p.rendaMensalReais ? centavos(p.rendaMensalReais) : undefined,
              parcelasAtuaisCentavos: p.parcelasAtuaisReais ? centavos(p.parcelasAtuaisReais) : undefined,
              seguroAnualCentavos: p.seguroAnualReais ? centavos(p.seguroAnualReais) : undefined,
              ipvaAnual: p.ipvaAnualPercentual ? p.ipvaAnualPercentual / 100 : undefined,
              manutencaoMensalCentavos: p.manutencaoMensalReais ? centavos(p.manutencaoMensalReais) : undefined,
              combustivelMensalCentavos: p.combustivelMensalReais ? centavos(p.combustivelMensalReais) : undefined,
            }),
          ),
        ),
    }),
    betaZodTool({
      name: "simular_pro_labore",
      description: "Compara o pró-labore atual com outro valor: Fator R, anexo do Simples, DAS mensal (pela receita média) e INSS de 11%. Não inclui IR da PF.",
      inputSchema: z.object({ novoProLaboreReais: z.number().positive() }),
      run: ({ novoProLaboreReais }) =>
        seguro(async () => {
          const f = await indicadoresFiscais(db);
          const anteriores = f.receitaMensal.slice(0, 12);
          const comDados = anteriores.filter((m) => m.valorCentavos > 0);
          const media = comDados.length ? comDados.reduce((s, m) => s + m.valorCentavos, 0) / comDados.length : 0;
          return json({
            aviso: f.mesesComDados < 12 ? `Só ${f.mesesComDados} meses de receita registrados: o Fator R ainda está distorcido.` : undefined,
            ...simularProLabore({
              rbt12Centavos: f.diagnostico.rbt12Centavos,
              receitaMensalMediaCentavos: Math.round(media),
              proLaboreAtualCentavos: f.perfil.proLaboreMensalCentavos,
              proLaboreNovoCentavos: centavos(novoProLaboreReais),
            }),
          });
        }),
    }),
    betaZodTool({
      name: "simular_quitacao",
      description: "Estratégia avalanche: ordem de quitação das dívidas e o efeito de um valor extra por mês e/ou um aporte único na primeira da fila (meses a menos e economia estimada).",
      inputSchema: z.object({ extraMensalReais: z.number().min(0), aporteUnicoReais: z.number().min(0).optional() }),
      run: ({ extraMensalReais, aporteUnicoReais }) =>
        seguro(async () => {
          const dividas = await resumoDividas(db);
          return json(
            simularQuitacao(
              dividas.map((d) => ({
                nome: d.nome,
                restanteCentavos: d.restanteCentavos,
                parcelaCentavos: d.parcelaMensalCentavos,
                parcelasRestantes: d.parcelasTotal - d.parcelasPagas,
                taxaMensal: d.taxaMensal,
                temConsequenciaGrave: Boolean(d.diasTolerancia) || d.tipo === "acordo_judicial" || d.tipo === "parcelamento_imposto",
              })),
              centavos(extraMensalReais),
              centavos(aporteUnicoReais ?? 0),
            ),
          );
        }),
    }),
    betaZodTool({
      name: "simular_meta",
      description: "Meta de dinheiro (reserva, entrada do carro): em quantos meses chega com um aporte mensal, ou quanto guardar por mês para chegar num prazo. Rendimento padrão 0,8% ao mês.",
      inputSchema: z.object({
        valorMetaReais: z.number().positive(),
        jaGuardadoReais: z.number().min(0).optional(),
        aporteMensalReais: z.number().min(0).optional(),
        prazoMeses: z.number().int().min(1).max(600).optional(),
        rendimentoMensalPercentual: z.number().min(0).max(5).optional(),
      }),
      run: (p) =>
        seguro(async () =>
          json(
            simularMeta({
              valorMetaCentavos: centavos(p.valorMetaReais),
              jaGuardadoCentavos: p.jaGuardadoReais ? centavos(p.jaGuardadoReais) : 0,
              aporteMensalCentavos: p.aporteMensalReais ? centavos(p.aporteMensalReais) : undefined,
              prazoMeses: p.prazoMeses,
              rendimentoMensal: p.rendimentoMensalPercentual !== undefined ? p.rendimentoMensalPercentual / 100 : undefined,
            }),
          ),
        ),
    }),
  ];
}

export const ROTULOS_FERRAMENTAS: Record<string, string> = {
  panorama_do_mes: "Panorama do mês",
  gastos_por_categoria: "Gastos por categoria",
  buscar_transacoes: "Busca de transações",
  gastos_recorrentes: "Gastos recorrentes",
  dividas: "Dívidas",
  cartoes: "Cartões",
  fluxo_de_caixa: "Fluxo de caixa",
  impostos_e_recebiveis: "Impostos e recebíveis",
  avisos_ativos: "Avisos",
  simular_financiamento: "Simulação de financiamento",
  simular_pro_labore: "Simulação de pró-labore",
  simular_quitacao: "Simulação de quitação",
  simular_meta: "Simulação de meta",
};


