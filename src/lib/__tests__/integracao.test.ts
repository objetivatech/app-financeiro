/**
 * Teste de ponta a ponta com PostgreSQL de verdade. Roda só quando TEST_DATABASE_URL está definida
 * (banco descartável: as tabelas são esvaziadas). Ex.:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5433/financeiro_teste pnpm test
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIAS_PADRAO } from "../classificacao/categorias";
import { classificarPendentes, reabrirClassificacaoDaConta, reaplicarIdentidade } from "../classificacao/executar";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { parcelasFixas } from "../compromissos/calculo";
import { atualizarCompromissos, contasAPagar, criarDivida, criarRecorrencia, fluxoProjetado, lembretesPendentes, marcarPago, resumoDividas } from "../compromissos/servico";
import { hojeBrasil, somarDias } from "../datas";
import { indicadoresFiscais, resumoRecebiveis } from "../fiscal/indicadores";
import { salvarPerfilFiscal } from "../fiscal/perfil";
import { deslocarMes as deslocarMesTeste } from "../formato";
import { sincronizarAsaas } from "../integracoes/asaas/sincronizar";
import { sincronizarMercadoPago } from "../integracoes/mercadopago/sincronizar";
import { cancelarFila, enfileirar, estadoFila, retomarFila, situacaoDosTrabalhos } from "../importacao/fila";
import { gravarExtrato, importarParaBanco, registrarFinaisDaFatura } from "../importacao/persistir";
import { somarMeses } from "../cartoes/calculo";
import { registrarFatura, resumoCartoes } from "../cartoes/servico";
import { visaoConsolidada } from "../visoes/calculo";
import { alertasDasTransacoes, alertasParaJanela, atualizarAlertas, contarAlertasAtivos, dispensarAlerta, listarAlertasAtivos, marcarVistos } from "../consultor/alertas";
import { ferramentasDoConsultor } from "../consultor/ferramentas";
import { listarConversas, mensagensDaConversa, perguntarAoConsultor, type EventoConsultor } from "../consultor/chat";
import { redefinirClienteIa } from "../ia/cliente";
import { somasPorMes } from "../visoes/consultas";
import { dadosConsolidado, dadosPainelPF, dadosPainelPJ } from "../visoes/paineis";

const url = process.env.TEST_DATABASE_URL;
const fixture = (nome: string) => new Uint8Array(readFileSync(`tests/fixtures/${nome}`));

describe.skipIf(!url)("importação + classificação no banco", () => {
  let pool: Pool;
  let db: Db;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`truncate cartoes_vinculados, mensagens_consultor, conversas, alertas, faturas, empresas, notas_fiscais, compromissos, dividas, recorrencias, uso_ia, clientes, integracoes, trabalhos_importacao, transacoes, importacoes, regras, contas, titulares, categorias, configuracoes restart identity cascade`);
    await db.insert(schema.categorias).values(CATEGORIAS_PADRAO);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("importa, cria contas, deduplica e detecta a retirada PJ → PF", async () => {
    const btg = await importarParaBanco(db, fixture("extrato-btg.ofx"), "btg.ofx");
    expect(btg).toMatchObject({ novas: 3, duplicadas: 0, contaNova: true, instituicaoReconhecida: true });

    const nubank = await importarParaBanco(db, fixture("nubank-conta.csv"), "nubank.csv");
    expect(nubank.novas).toBe(3);

    await expect(importarParaBanco(db, fixture("nubank-conta.csv"), "de-novo.csv")).rejects.toThrow(/já foi importado/);

    // O usuário diz de quem é cada conta.
    await db.update(schema.contas).set({ escopoPadrao: "PJ" }).where(sql`id = ${btg.contaId}`);
    await db.update(schema.contas).set({ escopoPadrao: "PF" }).where(sql`id = ${nubank.contaId}`);

    const resumo = await classificarPendentes(db, { usarIa: false });
    expect(resumo.transferencias).toBe(1);

    const todas = await db.query.transacoes.findMany({ orderBy: (t, { asc }) => [asc(t.id)] });
    const das = todas.find((t) => t.descricao.includes("DAS"));
    expect(das).toMatchObject({ natureza: "imposto", escopo: "PJ", categoriaId: "pj_impostos" });

    const saida = todas.find((t) => t.contaId === btg.contaId && t.valorCentavos === -500000)!;
    const entrada = todas.find((t) => t.contaId === nubank.contaId && t.valorCentavos === 500000)!;
    expect(saida.parTransferenciaId).toBe(entrada.id);
    expect(saida).toMatchObject({ natureza: "retirada_socio", revisar: true });
    expect(entrada).toMatchObject({ natureza: "retirada_socio", escopo: "PF" });
  });

  it("o mesmo período em outro arquivo não duplica", async () => {
    const outro = new TextEncoder().encode(
      "Data,Valor,Identificador,Descrição\n26/02/2026,-89.90,zzz,SUPERMERCADO (reexportado)\n28/02/2026,-10.00,zzz2,Padaria\n",
    );
    const r = await importarParaBanco(db, outro, "nubank-fev.csv");
    expect(r).toMatchObject({ novas: 1, duplicadas: 1 });
  });

  it("ao mudar o escopo de uma conta, refaz as transferências dela", async () => {
    const btg = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.instituicaoId, "btg") }))!;
    // Volta a conta para "misto": a retirada vira transferência genérica para revisar.
    await db.update(schema.contas).set({ escopoPadrao: "misto" }).where(sql`id = ${btg.id}`);
    await reabrirClassificacaoDaConta(db, btg.id);
    await classificarPendentes(db, { usarIa: false });
    let saida = (await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.valorCentavos, -500000) }))!;
    expect(saida).toMatchObject({ natureza: "transferencia_interna", revisar: true });

    // Agora marca como PJ: tem que voltar a ser retirada do sócio, nas duas pernas.
    await db.update(schema.contas).set({ escopoPadrao: "PJ" }).where(sql`id = ${btg.id}`);
    await reabrirClassificacaoDaConta(db, btg.id);
    await classificarPendentes(db, { usarIa: false });
    saida = (await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.valorCentavos, -500000) }))!;
    const entrada = (await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.id, saida.parTransferenciaId!) }))!;
    expect(saida).toMatchObject({ natureza: "retirada_socio", escopo: "PJ" });
    expect(entrada).toMatchObject({ natureza: "retirada_socio", escopo: "PF", valorCentavos: 500000 });
  });

  it("fila: processa em segundo plano, registra erros e retoma após reinício", async () => {
    const esperarFila = async () => {
      for (let i = 0; i < 100 && estadoFila().ocupada; i++) await new Promise((r) => setTimeout(r, 50));
    };
    const ok = await enfileirar(db, fixture("nubank-cartao.csv"), "fatura.csv");
    const ruim = await enfileirar(db, new TextEncoder().encode("isto não é um extrato"), "lixo.bin");
    await esperarFila();
    const [a, b] = (await situacaoDosTrabalhos(db, [ok, ruim])).sort((x, y) => x.id - y.id);
    expect(a).toMatchObject({ status: "concluido", resultado: expect.objectContaining({ novas: 3 }) });
    expect(b).toMatchObject({ status: "erro", mensagem: expect.stringMatching(/não reconhecido/) });
    const linha = await db.query.trabalhosImportacao.findFirst({ where: (t, { eq }) => eq(t.id, ok) });
    expect(linha?.arquivo).toBeNull();

    // Simula um contêiner reiniciado no meio de um processamento.
    const [preso] = await db
      .insert(schema.trabalhosImportacao)
      .values({ nomeArquivo: "bs2.csv", arquivo: Buffer.from(fixture("bs2-latin1.csv")), status: "processando" })
      .returning();
    await retomarFila(db);
    await esperarFila();
    const [retomado] = await situacaoDosTrabalhos(db, [preso.id]);
    expect(retomado.status).toBe("concluido");
  });

  it("fila: cancelar interrompe a leitura por IA em andamento e descarta o resto", async () => {
    // API "da Anthropic" falsa que nunca responde: simula um PDF demorando para ser lido.
    const servidor = createServer(() => {});
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    const porta = (servidor.address() as { port: number }).port;
    process.env.ANTHROPIC_API_KEY = "teste";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;
    try {
      const lento = await enfileirar(db, new TextEncoder().encode("%PDF-1.4 extrato longo"), "lento.pdf");
      const esperando = await enfileirar(db, fixture("extrato-btg.ofx"), "depois.ofx");
      for (let i = 0; i < 100; i++) {
        const [s] = await situacaoDosTrabalhos(db, [lento]);
        if (s.status === "processando") break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(await cancelarFila(db)).toBe(2);
      for (let i = 0; i < 100 && estadoFila().ocupada; i++) await new Promise((r) => setTimeout(r, 50));
      const situacoes = await situacaoDosTrabalhos(db, [lento, esperando]);
      for (const s of situacoes) expect(s).toMatchObject({ status: "erro", mensagem: "Cancelado por você." });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_BASE_URL;
      servidor.closeAllConnections();
      servidor.close();
    }
  });

  it("Asaas: sincroniza cobranças, notas, clientes e extrato; concilia e calcula indicadores", async () => {
    const hoje = new Date();
    const dia = (deslocamento: number) => new Date(hoje.getTime() + deslocamento * 86_400_000).toISOString().slice(0, 10);
    const mesPassado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
    const rotas: Record<string, unknown> = {
      "/v3/finance/balance": { balance: 2345.67 },
      "/v3/payments": {
        hasMore: false,
        data: [
          { id: "pay_ok", customer: "cus_1", value: 1500, netValue: 1498.01, status: "RECEIVED", billingType: "PIX", dueDate: mesPassado, paymentDate: mesPassado, description: "SEO" },
          { id: "pay_aberto", customer: "cus_2", value: 800, status: "PENDING", billingType: "BOLETO", dueDate: dia(10), description: "Site" },
          { id: "pay_vencido", customer: "cus_2", value: 300, status: "OVERDUE", billingType: "BOLETO", dueDate: dia(-5), description: "Hospedagem" },
        ],
      },
      "/v3/invoices": {
        hasMore: false,
        data: [{ id: "inv_1", status: "AUTHORIZED", customer: "cus_1", payment: "pay_ok", value: 1500, effectiveDate: mesPassado, municipalServiceCode: "7319-0/03" }],
      },
      "/v3/customers/cus_1": { id: "cus_1", name: "Cliente Um Ltda", cpfCnpj: "11.222.333/0001-81" },
      "/v3/customers/cus_2": { id: "cus_2", name: "Cliente Dois" },
      "/v3/financialTransactions": {
        hasMore: false,
        data: [
          { id: "ft_1", date: mesPassado, value: 1500, balance: 1500, type: "PAYMENT_RECEIVED", paymentId: "pay_ok", description: "Cobrança recebida - Cliente Um" },
          { id: "ft_2", date: mesPassado, value: -1.99, balance: 1498.01, type: "PAYMENT_FEE", paymentId: "pay_ok", description: "Taxa" },
        ],
      },
    };
    const pedidos: string[] = [];
    const servidor = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      pedidos.push(`${url.pathname}${url.search}`);
      const corpo = req.headers["access_token"] === "chave-teste" ? rotas[url.pathname] : undefined;
      res.writeHead(corpo ? 200 : req.headers["access_token"] ? 404 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo ?? { errors: [] }));
    });
    await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
    process.env.ASAAS_API_KEY = "chave-teste";
    process.env.ASAAS_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/v3`;
    try {
      const r = await sincronizarAsaas(db, { classificar: false });
      expect(r).toMatchObject({ cobrancas: 3, notas: 1, clientesNovos: 2, lancamentosNovos: 2, conciliados: 1, saldoCentavos: 234_567 });
      expect(pedidos.some((p) => p.startsWith("/v3/payments?") && p.includes("limit=100"))).toBe(true);

      const ok = await db.query.compromissos.findFirst({ where: (c, { eq }) => eq(c.idExterno, "pay_ok") });
      expect(ok).toMatchObject({ status: "pago", valorCentavos: 150_000 });
      expect(ok?.transacaoId).not.toBeNull();
      const taxa = await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.idExterno, "ft_2") });
      expect(taxa).toMatchObject({ categoriaId: "pj_taxas_pagamento", escopo: "PJ", classificadoPor: "heuristica", valorCentavos: -199 });

      // Rodar de novo não duplica nada.
      const r2 = await sincronizarAsaas(db, { classificar: false });
      expect(r2.lancamentosNovos).toBe(0);
      expect(await db.$count(schema.compromissos)).toBe(3);

      const rec = await resumoRecebiveis(db);
      expect(rec).toMatchObject({ aReceber30dCentavos: 80_000, vencidoCentavos: 30_000, vencidoQtd: 1 });
      expect(rec.maiorCliente?.nome).toBe("Cliente Um Ltda");

      await salvarPerfilFiscal(db, { proLaboreMensalCentavos: 450_000, sujeitoFatorR: true, custoFixoPjCentavos: 700_000, emailResumo: "" });
      const ind = await indicadoresFiscais(db);
      expect(ind.fonte).toBe("notas");
      expect(ind.diagnostico.rbt12Centavos).toBe(150_000);
      expect(ind.diagnostico.anexo).toBe("III");
    } finally {
      delete process.env.ASAAS_API_KEY;
      delete process.env.ASAAS_BASE_URL;
      servidor.closeAllConnections();
      servidor.close();
    }
  });

  it("dívidas e contas fixas: parcelas, alerta de atraso, conciliação com o extrato e fluxo de caixa", async () => {
    const hoje = hojeBrasil();
    const nubank = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.instituicaoId, "nubank") }))!;

    // Acordo com tolerância de 30 dias: 1ª parcela venceu há 10 dias e não foi paga.
    const acordo = await criarDivida(db, {
      nome: "Acordo judicial",
      tipo: "acordo_judicial",
      escopo: "PF",
      diasTolerancia: 30,
      consequenciaAtraso: "O acordo é cancelado",
      lembreteAposPagar: "Enviar comprovante ao escritório em 2 dias úteis",
      parcelas: parcelasFixas(somarDias(hoje, -10), 53, 63_750),
    });
    // Empréstimo: recebeu R$ 595, paga 3× de R$ 300 (a 1ª já paga).
    await criarDivida(db, {
      nome: "Empréstimo MP",
      tipo: "emprestimo",
      escopo: "PF",
      valorRecebidoCentavos: 59_500,
      parcelas: parcelasFixas(somarDias(hoje, -30), 3, 30_000),
      parcelasJaPagas: 1,
    });
    await criarRecorrencia(db, {
      descricao: "Contabilidade",
      tipo: "pagar",
      escopo: "PJ",
      valorCentavos: 45_000,
      diaVencimento: 10,
      padraoExtrato: "contabil",
      inicio: somarDias(hoje, -40),
    });

    let dividasResumo = await resumoDividas(db);
    const a = dividasResumo.find((d) => d.id === acordo)!;
    expect(a).toMatchObject({ parcelasTotal: 53, parcelasPagas: 0, diasAtraso: 10, diasTolerancia: 30 });
    const mp = dividasResumo.find((d) => d.nome === "Empréstimo MP")!;
    expect(mp).toMatchObject({ parcelasPagas: 1, restanteCentavos: 60_000 });
    expect(mp.taxaMensal).toBeGreaterThan(0.2);

    const { pendentes } = await contasAPagar(db, 30);
    expect(pendentes.some((p) => p.status === "vencido" && p.descricao.startsWith("Acordo judicial (1/53)"))).toBe(true);
    expect(pendentes.some((p) => p.descricao === "Contabilidade")).toBe(true);

    // O pagamento aparece no extrato do Nubank 2 dias depois do vencimento: concilia sozinho.
    const vencAcordo = somarDias(hoje, -10);
    await db.insert(schema.transacoes).values({
      contaId: nubank.id,
      data: somarDias(vencAcordo, 2),
      descricao: "PIX ENVIADO PORTO SEGURO",
      descricaoNormalizada: "PIX ENVIADO PORTO SEGURO",
      valorCentavos: -63_750,
      hashDedup: "teste-acordo",
    });
    const r = await atualizarCompromissos(db);
    expect(r.conciliados).toBeGreaterThanOrEqual(1);
    dividasResumo = await resumoDividas(db);
    expect(dividasResumo.find((d) => d.id === acordo)).toMatchObject({ parcelasPagas: 1, diasAtraso: 0 });
    const lembretes = await lembretesPendentes(db);
    expect(lembretes.map((l) => l.descricao)).toContain("Acordo judicial (1/53)");
    const transacao = await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.hashDedup, "teste-acordo") });
    expect(transacao).toMatchObject({ categoriaId: "pf_dividas", classificadoPor: "regra" });

    // Marcar manualmente como pago.
    const contab = (await contasAPagar(db, 30)).pendentes.find((p) => p.descricao === "Contabilidade")!;
    await marcarPago(db, contab.id, hoje);
    expect((await contasAPagar(db, 30)).pagasRecentes.some((p) => p.id === contab.id)).toBe(true);

    const fluxo = await fluxoProjetado(db, 13);
    expect(fluxo.semanas).toHaveLength(13);
    const saidasPF = fluxo.semanas.reduce((s, w) => s + w.PF.saidas, 0);
    expect(saidasPF).toBeGreaterThan(0);
    expect(fluxo.semanas.at(-1)!.PF.saldo).toBe(fluxo.saldoInicial.PF + fluxo.semanas.reduce((s, w) => s + w.PF.entradas - w.PF.saidas, 0));
  });

  it("cartão: parcelas de faturas diferentes não viram duplicata, projeção e baixa da fatura", async () => {
    const hoje = hojeBrasil();
    const nubank = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.escopoPadrao, "PF") }))!;
    const [cartao] = await db
      .insert(schema.contas)
      .values({ instituicaoNome: "Cartão Teste", apelido: "Cartão Teste", tipo: "cartao_credito", escopoPadrao: "PF", diaFechamento: 3, diaVencimento: 10, limiteCentavos: 500_000, contaPagamentoId: nubank.id })
      .returning();
    const venc1 = somarDias(hoje, 6);
    const venc2 = somarMeses(venc1, 1);
    const fatura = (venc: string, parcela: number) => ({
      formato: "pdf" as const,
      conta: { tipo: "cartao_credito" as const },
      moeda: "BRL",
      avisos: [],
      extraidoPor: "ia" as const,
      // A fatura repete a data da compra original em todo mês.
      transacoes: [
        { data: "2026-08-15", descricao: `LOJA X ${parcela}/10`, valorCentavos: -10_000, parcela: { atual: parcela, total: 10 } },
        { data: somarDias(venc, -12), descricao: "IFOOD *RESTAURANTE", valorCentavos: -4_590 },
      ],
      fatura: { vencimento: venc, totalCentavos: 14_590 },
    });
    for (const [venc, parcela] of [[venc1, 3], [venc2, 4]] as const) {
      const g = await gravarExtrato(db, fatura(venc, parcela), { contaId: cartao.id, nomeArquivo: `fatura-${parcela}`, hashArquivo: `fatura-${parcela}` });
      expect(g.novas).toBe(2);
      await registrarFatura(db, { contaId: cartao.id, vencimento: venc, valorCentavos: 14_590, importacaoId: g.importacaoId, origem: "importacao" });
    }
    const [r] = (await resumoCartoes(db)).filter((c) => c.conta.id === cartao.id);
    expect(r.faturaAberta).toMatchObject({ vencimento: venc1, valorCentavos: 14_590 });
    expect(r.parcelas).toHaveLength(6); // parcelas 5 a 10
    expect(r.parcelas[0]).toMatchObject({ numero: 5, vencimento: somarMeses(venc2, 1), valorCentavos: 10_000 });
    expect(r.parceladoAVencerCentavos).toBe(60_000);

    // O fluxo inclui as faturas conhecidas e as parcelas dos meses seguintes.
    const fluxo = await fluxoProjetado(db, 13);
    expect(fluxo.semanas.reduce((s, w) => s + w.PF.saidas, 0)).toBeGreaterThanOrEqual(14_590 * 2 + 10_000);

    // O pagamento da fatura aparece no extrato: baixa a fatura e vira "pagamento de fatura" (não é gasto).
    await db.insert(schema.transacoes).values({
      contaId: nubank.id,
      data: venc1,
      descricao: "PAGAMENTO CARTAO TESTE",
      descricaoNormalizada: "PAGAMENTO CARTAO TESTE",
      valorCentavos: -14_590,
      hashDedup: "teste-fatura",
    });
    await atualizarCompromissos(db);
    const [depois] = (await resumoCartoes(db)).filter((c) => c.conta.id === cartao.id);
    expect(depois.faturaAberta?.vencimento).toBe(venc2);
    const pagamento = await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.hashDedup, "teste-fatura") });
    expect(pagamento).toMatchObject({ natureza: "pagamento_fatura", categoriaId: "mov_fatura" });
  });

  it("classificadores complementares: estabelecimento conhecido e CNPJ → CNAE, sem IA", async () => {
    const servidor = createServer((req, res) => {
      if (req.url?.endsWith("/45997418000153")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ razao_social: "SABOR LTDA", cnae_fiscal: 5611201, cnae_fiscal_descricao: "Restaurantes e similares" }));
      } else {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const porta = (servidor.address() as { port: number }).port;
    process.env.CNPJ_API_URL = `http://127.0.0.1:${porta}/api/cnpj/v1`;
    process.env.CONSULTA_CNPJ = "1";
    try {
      const pf = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.escopoPadrao, "PF") }))!;
      const base = { contaId: pf.id, data: hojeBrasil() };
      await db.insert(schema.transacoes).values([
        { ...base, descricao: "UBER *TRIP", descricaoNormalizada: "UBER *TRIP", valorCentavos: -2_300, hashDedup: "enr-1" },
        { ...base, descricao: "PIX ENVIADO SABOR", descricaoNormalizada: "PIX ENVIADO SABOR", valorCentavos: -5_000, hashDedup: "enr-2", documentoContraparte: "45997418000153" },
      ]);
      const resumo = await classificarPendentes(db, { usarIa: false });
      expect(resumo.porEnriquecimento).toBeGreaterThanOrEqual(2);
      const uber = await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.hashDedup, "enr-1") });
      expect(uber).toMatchObject({ categoriaId: "pf_transporte", classificadoPor: "heuristica" });
      const sabor = await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.hashDedup, "enr-2") });
      expect(sabor).toMatchObject({ categoriaId: "pf_alimentacao" });
      const cache = await db.query.empresas.findFirst({ where: (e, { eq }) => eq(e.cnpj, "45997418000153") });
      expect(cache).toMatchObject({ situacao: "ok", cnae: "5611201" });
    } finally {
      delete process.env.CNPJ_API_URL;
      delete process.env.CONSULTA_CNPJ;
      servidor.close();
    }
  });

  it("painéis: o que ficou na empresa + o que sobrou para você = resultado consolidado, em todo mês", async () => {
    const mes = hojeBrasil().slice(0, 7);
    const somas = await somasPorMes(db, "2026-01", mes);
    expect(somas.length).toBeGreaterThan(1);
    for (const s of somas) {
      const c = visaoConsolidada(s);
      expect(c.ficouNaEmpresa + c.sobrouParaVoce).toBe(c.resultado);
    }
    const pj = await dadosPainelPJ(db, mes);
    const pf = await dadosPainelPF(db, mes);
    const consolidado = await dadosConsolidado(db, mes);
    expect(pj.serie).toHaveLength(6);
    expect(pf.categorias.some((c) => c.categoriaId === "pf_alimentacao")).toBe(true);
    expect(consolidado.posicaoLiquida).toBe(consolidado.caixa + consolidado.aReceber - consolidado.dividasRestantes - consolidado.cartoesAVencer);
  });

  it("inteligência interna: avisos aparecem, não duplicam, respeitam o dispensado e se resolvem sozinhos", async () => {
    const pj = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.escopoPadrao, "PJ") }))!;
    const [gasto] = await db
      .insert(schema.transacoes)
      .values({ contaId: pj.id, data: hojeBrasil(), descricao: "ZAFFARI LOJA 9", descricaoNormalizada: "ZAFFARI LOJA 9", valorCentavos: -25_000, hashDedup: "aviso-1", escopo: "PF", categoriaId: "pf_mercado", natureza: "despesa_pessoal_na_pj", classificadoPor: "usuario" })
      .returning();
    const r1 = await atualizarAlertas(db);
    expect(r1.ativos).toBeGreaterThan(0);
    const aviso = await db.query.alertas.findFirst({ where: (a, { eq }) => eq(a.chave, `tx:mistura_pf:${gasto.id}`) });
    expect(aviso).toMatchObject({ status: "ativo", transacaoId: gasto.id, gravidade: "atencao" });
    expect((await alertasParaJanela(db)).some((a) => a.id === aviso!.id)).toBe(true);
    expect((await alertasDasTransacoes(db, [gasto.id])).get(gasto.id)).toHaveLength(1);

    // Rodar de novo não duplica; visto não volta para a janela.
    await marcarVistos(db, [aviso!.id]);
    const r2 = await atualizarAlertas(db);
    expect(r2.novos).toBe(0);
    expect((await alertasParaJanela(db)).some((a) => a.id === aviso!.id)).toBe(false);

    // Você corrige a transação: a situação some e o aviso se resolve sozinho.
    await db.update(schema.transacoes).set({ escopo: "PJ", categoriaId: "pj_outros", natureza: "comum" }).where(sql`id = ${gasto.id}`);
    await atualizarAlertas(db);
    expect(await db.query.alertas.findFirst({ where: (a, { eq }) => eq(a.id, aviso!.id) })).toMatchObject({ status: "resolvido" });

    // Dispensado não volta, mesmo que a situação continue.
    const qualquer = (await listarAlertasAtivos(db))[0];
    if (qualquer) {
      await dispensarAlerta(db, qualquer.id);
      await atualizarAlertas(db);
      expect(await db.query.alertas.findFirst({ where: (a, { eq }) => eq(a.id, qualquer.id) })).toMatchObject({ status: "dispensado" });
    }
    const contagem = await contarAlertasAtivos(db);
    expect(contagem.total).toBe((await listarAlertasAtivos(db)).length);
  });

  it("ferramentas do consultor consultam os dados e escondem documentos", async () => {
    const ferramentas = ferramentasDoConsultor(db);
    const rodar = async (nome: string, entrada: unknown) => JSON.parse((await ferramentas.find((f) => f.name === nome)!.run(entrada as never)) as string);
    const panorama = await rodar("panorama_do_mes", {});
    expect(panorama.empresa).toHaveProperty("receitaTotal");
    expect(panorama.consolidado).toHaveProperty("posicaoLiquida_reais");
    expect(panorama.erro).toBeUndefined();
    await db.insert(schema.transacoes).values({
      contaId: (await db.query.contas.findFirst())!.id,
      data: hojeBrasil(),
      descricao: "PIX ENVIADO 123.456.789-09 FULANO",
      descricaoNormalizada: "PIX ENVIADO 12345678909 FULANO",
      valorCentavos: -1_000,
      hashDedup: "tool-cpf",
    });
    const busca = await rodar("buscar_transacoes", { texto: "FULANO" });
    expect(busca.quantidade).toBe(1);
    expect(busca.transacoes[0].descricao).toBe("PIX ENVIADO [CPF] FULANO");
    expect(busca.transacoes[0].valor_reais).toBe(-10);
    for (const nome of ["dividas", "cartoes", "fluxo_de_caixa", "impostos_e_recebiveis", "avisos_ativos", "gastos_recorrentes"]) {
      expect((await rodar(nome, {})).erro).toBeUndefined();
    }
    expect((await rodar("gastos_por_categoria", { escopo: "PF" })).erro).toBeUndefined();
    expect((await rodar("simular_quitacao", { extraMensalReais: 200 })).ordem.length).toBeGreaterThan(0);
    expect((await rodar("simular_pro_labore", { novoProLaboreReais: 5000 })).novo).toHaveProperty("anexo");
    expect((await rodar("simular_financiamento", { valorBemReais: 25000, entradaReais: 10000, taxaMensalPercentual: 1.8, meses: 36 })).parcela_reais).toBeGreaterThan(500);
  });

  it("consultor: conversa com ferramenta e resposta em streaming (API falsa)", async () => {
    const pedidos: { tools: { name: string }[]; messages: { role: string; content: unknown }[]; system: unknown }[] = [];
    const sse = (eventos: object[]) => eventos.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
    const mensagem = (id: string) => ({ type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
    const servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        const pedido = JSON.parse(corpo);
        pedidos.push(pedido);
        res.writeHead(200, { "content-type": "text/event-stream" });
        if (pedidos.length === 1) {
          res.end(
            sse([
              mensagem("m1"),
              { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu1", name: "panorama_do_mes", input: {} } },
              { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
              { type: "content_block_stop", index: 0 },
              { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } },
              { type: "message_stop" },
            ]),
          );
        } else {
          res.end(
            sse([
              mensagem("m2"),
              { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
              { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Sua empresa está bem. " } },
              { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "**O que fazer agora**: importar o extrato." } },
              { type: "content_block_stop", index: 0 },
              { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 12 } },
              { type: "message_stop" },
            ]),
          );
        }
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, ok));
    process.env.ANTHROPIC_API_KEY = "teste";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    redefinirClienteIa();
    try {
      const eventos: EventoConsultor[] = [];
      await perguntarAoConsultor(db, { pergunta: "Como está minha situação?" }, (e) => eventos.push(e));
      const texto = eventos.filter((e) => e.tipo === "texto").map((e) => e.delta).join("");
      expect(texto).toBe("Sua empresa está bem. **O que fazer agora**: importar o extrato.");
      expect(eventos.some((e) => e.tipo === "ferramenta" && e.nome === "Panorama do mês")).toBe(true);
      expect(eventos.at(-1)?.tipo).toBe("fim");
      // A 2ª chamada levou o resultado da ferramenta (dados reais do banco, em reais).
      const resultado = JSON.stringify(pedidos[1].messages.at(-1));
      expect(resultado).toContain("tool_result");
      expect(resultado).toContain("posicaoLiquida_reais");
      expect(pedidos[0].tools.map((t) => t.name)).toContain("simular_financiamento");
      const conversa = (await listarConversas(db))[0];
      const msgs = await mensagensDaConversa(db, conversa.id);
      expect(msgs.map((m) => m.papel)).toEqual(["usuario", "consultor"]);
      expect(msgs[1].ferramentas).toEqual(["Panorama do mês"]);

      // Segunda pergunta na mesma conversa leva o histórico.
      pedidos.length = 0;
      await perguntarAoConsultor(db, { pergunta: "E o carro?", conversaId: conversa.id }, () => undefined);
      expect(pedidos[0].messages.slice(0, 3).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_BASE_URL;
      redefinirClienteIa();
      servidor.close();
    }
  });

  it("v0.8: retiradas pelo seu nome, enquadramento MEI → ME e cartões virtuais", async () => {
    // 1) Pix da empresa para você, sem a conta pessoal no app, classificado pela IA como despesa.
    const pj = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.escopoPadrao, "PJ") }))!;
    const [pix] = await db
      .insert(schema.transacoes)
      .values({ contaId: pj.id, data: hojeBrasil(), descricao: "PIX ENVIADO FULANO DE TAL SOCIO", descricaoNormalizada: "PIX ENVIADO FULANO DE TAL SOCIO", valorCentavos: -300_000, hashDedup: "v08-pix", escopo: "PJ", categoriaId: "pj_folha", classificadoPor: "ia" })
      .returning();
    await salvarPerfilFiscal(db, { proLaboreMensalCentavos: 450_000, nomeSocio: "Fulano de Tal Socio", regimes: [{ regime: "mei", inicio: "2000-01" }, { regime: "simples", inicio: deslocarMesTeste(hojeBrasil().slice(0, 7), -2) }] });
    expect(await reaplicarIdentidade(db)).toBeGreaterThanOrEqual(1);
    expect(await db.query.transacoes.findFirst({ where: (t, { eq }) => eq(t.id, pix.id) })).toMatchObject({ natureza: "retirada_socio", categoriaId: "mov_socio", revisar: true });
    const somas = await somasPorMes(db, hojeBrasil().slice(0, 7), hojeBrasil().slice(0, 7));
    expect(visaoConsolidada(somas[0]).ficouNaEmpresa + visaoConsolidada(somas[0]).sobrouParaVoce).toBe(visaoConsolidada(somas[0]).resultado);

    // 2) Fator R com a folha só desde a saída do MEI.
    const f = await indicadoresFiscais(db);
    expect(f.regimeAtual).toBe("simples");
    expect(f.mesesDeFolha).toBe(2);
    expect(f.diagnostico.folha12Centavos).toBe(900_000);
    expect(f.folhaCompletaEm).toBe(deslocarMesTeste(hojeBrasil().slice(0, 7), 10));

    // 3) Finais diferentes na fatura viram cartões virtuais do mesmo cartão.
    const cartao = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.tipo, "cartao_credito") }))!;
    await registrarFinaisDaFatura(db, cartao.id, "1111", {
      formato: "pdf", conta: {}, moeda: "BRL", avisos: [], extraidoPor: "ia",
      transacoes: [
        { data: hojeBrasil(), descricao: "A", valorCentavos: -100, finalCartao: "1111" },
        { data: hojeBrasil(), descricao: "B", valorCentavos: -100, finalCartao: "9876" },
      ],
    });
    const [c] = (await resumoCartoes(db)).filter((x) => x.conta.id === cartao.id);
    expect(c.vinculados.map((v) => v.final)).toEqual(["9876"]);
  });

  it("Mercado Pago: token sem acesso a /users/me segue com o ID do token; tudo recusado vira erro explicado", async () => {
    let recusarTudo = false;
    const servidor = createServer((req, res) => {
      const json = (status: number, dados: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(dados));
      };
      const url = req.url ?? "";
      const recusa = { code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", status: 403, message: "At least one policy returned UNAUTHORIZED.", blocked_by: "PolicyAgent" };
      if (url.startsWith("/users/me") || recusarTudo) return json(403, recusa);
      if (url.startsWith("/v1/payments/search")) {
        return json(200, {
          paging: { total: 2, limit: 50, offset: 0 },
          results: [
            { id: 701, status: "approved", collector_id: 4242, transaction_amount: 80, date_created: `${somarDias(hojeBrasil(), -2)}T09:00:00.000-03:00`, date_approved: `${somarDias(hojeBrasil(), -2)}T09:00:00.000-03:00` },
            { id: 702, status: "approved", collector_id: 1, transaction_amount: 10, date_created: `${somarDias(hojeBrasil(), -2)}T09:00:00.000-03:00` },
          ],
        });
      }
      if (url.startsWith("/v1/account/release_report/list")) return json(200, []);
      if (req.method === "POST") return json(202, {});
      json(404, {});
    });
    await new Promise<void>((ok) => servidor.listen(0, ok));
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-123-110426-abcdef-4242";
    process.env.MERCADOPAGO_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    try {
      await db.delete(schema.integracoes).where(sql`id = 'mercadopago'`);
      const r = await sincronizarMercadoPago(db, { esperaRelatorioMs: 0 });
      expect(r.pagamentos).toBe(1);
      expect(r.avisos.join(" ")).toMatch(/PF ou PJ em Contas/);
      expect(await db.query.compromissos.findFirst({ where: (c, { and, eq }) => and(eq(c.origem, "mercadopago"), eq(c.idExterno, "701")) })).toBeTruthy();
      expect((await db.query.integracoes.findFirst({ where: (i, { eq }) => eq(i.id, "mercadopago") }))?.status).toBe("ok");

      recusarTudo = true;
      await expect(sincronizarMercadoPago(db, { esperaRelatorioMs: 0 })).rejects.toThrow(/PRODUÇÃO/);
      expect((await db.query.integracoes.findFirst({ where: (i, { eq }) => eq(i.id, "mercadopago") }))?.status).toBe("erro");
    } finally {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      delete process.env.MERCADOPAGO_BASE_URL;
      servidor.close();
      await db.delete(schema.integracoes).where(sql`id = 'mercadopago'`);
      await db.delete(schema.compromissos).where(sql`origem = 'mercadopago'`);
      await db.delete(schema.contas).where(sql`instituicao_id = 'mercadopago'`);
    }
  });

  it("Mercado Pago: conta pelo CNPJ, pagamentos recebidos e extrato pelo relatório (API falsa)", async () => {
    const csv = [
      "DATE;SOURCE_ID;EXTERNAL_REFERENCE;RECORD_TYPE;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;PAYMENT_METHOD;BALANCE_AMOUNT",
      `${somarDias(hojeBrasil(), -5)}T10:00:00.000-03:00;9001;;release;payment;485.50;0.00;pix;485.50`,
      `${somarDias(hojeBrasil(), -4)}T10:00:00.000-03:00;9002;;release;fee;0.00;3.20;;482.30`,
    ].join("\n");
    const pedidos: string[] = [];
    let relatorioPedido: { begin_date: string; end_date: string } | null = null;
    const servidor = createServer((req, res) => {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        pedidos.push(`${req.method} ${req.url}`);
        expect(req.headers.authorization).toBe("Bearer APP_USR-teste");
        const json = (status: number, dados: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(dados));
        };
        const url = req.url ?? "";
        if (url.startsWith("/users/me")) return json(200, { id: 42, first_name: "Empresa", identification: { type: "CNPJ", number: "28250988000166" }, company: { corporate_name: "EMPRESA TESTE LTDA" } });
        if (url.startsWith("/v1/payments/search")) {
          return json(200, {
            paging: { total: 2, limit: 50, offset: 0 },
            results: [
              { id: 501, status: "approved", collector_id: 42, transaction_amount: 500, transaction_details: { net_received_amount: 485.5 }, date_created: `${somarDias(hojeBrasil(), -5)}T09:00:00.000-03:00`, date_approved: `${somarDias(hojeBrasil(), -5)}T09:00:00.000-03:00`, description: "Projeto SEO" },
              { id: 502, status: "approved", collector_id: 999, transaction_amount: 50, date_created: `${somarDias(hojeBrasil(), -3)}T09:00:00.000-03:00` },
            ],
          });
        }
        if (req.method === "POST" && url === "/v1/account/release_report") {
          relatorioPedido = JSON.parse(corpo);
          return json(202, {});
        }
        if (url.startsWith("/v1/account/release_report/list")) {
          return json(200, relatorioPedido ? [{ id: 1, file_name: "financeiro-app-1.csv", begin_date: relatorioPedido.begin_date, end_date: relatorioPedido.end_date, date_created: new Date().toISOString() }] : []);
        }
        if (url === "/v1/account/release_report/financeiro-app-1.csv") {
          res.writeHead(200, { "content-type": "text/csv" });
          return res.end(csv);
        }
        json(404, { message: "not found" });
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, ok));
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste";
    process.env.MERCADOPAGO_BASE_URL = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    try {
      const r = await sincronizarMercadoPago(db, { esperaRelatorioMs: 0 });
      expect(r).toMatchObject({ escopo: "PJ", pagamentos: 1, lancamentosNovos: 2, relatorioPendente: null });
      const conta = (await db.query.contas.findFirst({ where: (c, { eq }) => eq(c.instituicaoId, "mercadopago") }))!;
      expect(conta).toMatchObject({ escopoPadrao: "PJ", tipo: "pagamento" });
      const recebido = await db.query.compromissos.findFirst({ where: (c, { and, eq }) => and(eq(c.origem, "mercadopago"), eq(c.idExterno, "501")) });
      expect(recebido).toMatchObject({ tipo: "receber", status: "pago", valorCentavos: 50_000, escopo: "PJ" });
      const tarifa = await db.query.transacoes.findFirst({ where: (t, { and, eq }) => and(eq(t.contaId, conta.id), eq(t.valorCentavos, -320)) });
      expect(tarifa).toMatchObject({ categoriaId: "pj_taxas_pagamento" });
      const integ = await db.query.integracoes.findFirst({ where: (i, { eq }) => eq(i.id, "mercadopago") });
      expect(integ).toMatchObject({ status: "ok", extratoAte: somarDias(hojeBrasil(), -1) });
      expect(pedidos.filter((p) => p.startsWith("POST"))).toEqual(["POST /v1/account/release_report"]);

      // Segunda vez: nada novo para pedir (extrato já está em dia), pagamentos atualizados sem duplicar.
      const r2 = await sincronizarMercadoPago(db, { esperaRelatorioMs: 0 });
      expect(r2.lancamentosNovos).toBe(0);
      expect(await db.$count(schema.compromissos, sql`origem = 'mercadopago'`)).toBe(1);
    } finally {
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      delete process.env.MERCADOPAGO_BASE_URL;
      servidor.close();
    }
  });
});
