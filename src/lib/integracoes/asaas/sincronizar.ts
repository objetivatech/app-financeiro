import { desc, eq, sql } from "drizzle-orm";
import { classificarPendentes } from "../../classificacao/executar";
import { atualizarCompromissos } from "../../compromissos/servico";
import type { Db } from "../../db";
import { clientes, compromissos, contas, integracoes, notasFiscais, transacoes } from "../../db/schema";
import { hojeBrasil, primeiroDoMes, somarDias } from "../../datas";
import { gravarExtrato } from "../../importacao/persistir";
import { asaasGet, asaasListar, ErroAsaas, type AsaasCliente, type AsaasCobranca, type AsaasLancamento, type AsaasNota } from "./cliente";
import { centavos, compromissoDaCobranca, extratoDoAsaas, notaDoAsaas } from "./mapear";

const ID = "asaas";
/** Na primeira sincronização trazemos 13 meses: 12 para a receita bruta do Simples (RBT12) + o mês corrente. */
const MESES_HISTORICO = 13;

export interface ResumoSincronizacao {
  cobrancas: number;
  notas: number;
  clientesNovos: number;
  lancamentosNovos: number;
  conciliados: number;
  saldoCentavos: number | null;
  avisos: string[];
}

const estado = globalThis as unknown as { __asaasSincronizando?: boolean };

export function asaasSincronizando(): boolean {
  return Boolean(estado.__asaasSincronizando);
}

/** Conta "Asaas" da empresa onde o extrato é gravado; criada na primeira vez. */
async function contaDoAsaas(db: Db, contaIdSalva: number | null): Promise<number> {
  if (contaIdSalva) {
    const existe = await db.query.contas.findFirst({ where: eq(contas.id, contaIdSalva) });
    if (existe) return existe.id;
  }
  const candidatas = await db.query.contas.findMany({ where: eq(contas.instituicaoId, "asaas") });
  const conta = candidatas.find((c) => c.tipo !== "cartao_credito");
  if (conta) return conta.id;
  const [nova] = await db
    .insert(contas)
    .values({ instituicaoId: "asaas", instituicaoNome: "Asaas", apelido: "Asaas · PJ", tipo: "pagamento", escopoPadrao: "PJ" })
    .returning({ id: contas.id });
  return nova.id;
}

/** Garante o cliente local para um id do Asaas, buscando o cadastro só quando ainda não conhecemos. */
async function resolverClientes(db: Db, idsExternos: Set<string>, signal?: AbortSignal): Promise<{ mapa: Map<string, number>; novos: number }> {
  const conhecidos = await db.query.clientes.findMany({ where: eq(clientes.origem, ID) });
  const mapa = new Map(conhecidos.map((c) => [c.idExterno, c.id]));
  let novos = 0;
  for (const idExterno of idsExternos) {
    if (mapa.has(idExterno)) continue;
    let dados: AsaasCliente;
    try {
      dados = await asaasGet<AsaasCliente>(`/customers/${encodeURIComponent(idExterno)}`, {}, signal);
    } catch (erro) {
      if (erro instanceof ErroAsaas && erro.status === 404) dados = { id: idExterno, name: "Cliente removido" };
      else throw erro;
    }
    const [linha] = await db
      .insert(clientes)
      .values({
        origem: ID,
        idExterno,
        nome: dados.name?.trim() || "Cliente sem nome",
        documento: dados.cpfCnpj?.replace(/\D/g, "") || null,
        email: dados.email ?? null,
      })
      .onConflictDoUpdate({ target: [clientes.origem, clientes.idExterno], set: { nome: sql`excluded.nome` } })
      .returning({ id: clientes.id });
    mapa.set(idExterno, linha.id);
    novos++;
  }
  return { mapa, novos };
}

/**
 * Sincroniza o Asaas: saldo, cobranças (contas a receber), notas fiscais e extrato da conta.
 * Pode rodar quantas vezes quiser: tudo é atualizado por id e o extrato continua de onde parou.
 */
export async function sincronizarAsaas(db: Db, opcoes: { signal?: AbortSignal; classificar?: boolean } = {}): Promise<ResumoSincronizacao> {
  if (estado.__asaasSincronizando) throw new ErroAsaas("Já existe uma sincronização do Asaas em andamento.");
  estado.__asaasSincronizando = true;
  const { signal } = opcoes;
  const hoje = hojeBrasil();
  const resumo: ResumoSincronizacao = { cobrancas: 0, notas: 0, clientesNovos: 0, lancamentosNovos: 0, conciliados: 0, saldoCentavos: null, avisos: [] };

  try {
    const salvo = await db.query.integracoes.findFirst({ where: eq(integracoes.id, ID) });
    const primeiraVez = !salvo?.ultimaSincronizacao;
    await db
      .insert(integracoes)
      .values({ id: ID, status: "sincronizando" })
      .onConflictDoUpdate({ target: integracoes.id, set: { status: "sincronizando", mensagem: null } });

    const contaId = await contaDoAsaas(db, salvo?.contaId ?? null);
    const inicioHistorico = primeiroDoMes(-MESES_HISTORICO);

    // 1. Saldo atual
    const saldo = await asaasGet<{ balance?: number }>("/finance/balance", {}, signal);
    resumo.saldoCentavos = saldo.balance !== undefined ? centavos(saldo.balance) : null;

    // 2. Cobranças: na primeira vez, 13 meses; depois, as que vencem a partir de 120 dias atrás
    //    (pegam mudanças de status) e as pagas recentemente (pagamento atrasado de cobrança antiga).
    const cobrancas = new Map<string, AsaasCobranca>();
    const filtros: Record<string, string>[] = primeiraVez
      ? [{ "dueDate[ge]": inicioHistorico }]
      : [{ "dueDate[ge]": somarDias(hoje, -120) }, { "paymentDate[ge]": somarDias(hoje, -30) }];
    for (const filtro of filtros) {
      for await (const c of asaasListar<AsaasCobranca>("/payments", filtro, signal)) cobrancas.set(c.id, c);
    }
    const notas: AsaasNota[] = [];
    for await (const n of asaasListar<AsaasNota>("/invoices", { "effectiveDate[Ge]": primeiraVez ? inicioHistorico : somarDias(hoje, -60) }, signal)) {
      notas.push(n);
    }

    const idsClientes = new Set<string>();
    for (const c of cobrancas.values()) if (c.customer) idsClientes.add(c.customer);
    for (const n of notas) if (n.customer) idsClientes.add(n.customer);
    const { mapa: mapaClientes, novos } = await resolverClientes(db, idsClientes, signal);
    resumo.clientesNovos = novos;

    for (const c of cobrancas.values()) {
      const campos = { ...compromissoDaCobranca(c, hoje), clienteId: c.customer ? (mapaClientes.get(c.customer) ?? null) : null, contaId };
      await db
        .insert(compromissos)
        .values(campos)
        .onConflictDoUpdate({
          target: [compromissos.origem, compromissos.idExterno],
          set: { ...campos, atualizadoEm: new Date() },
        });
      resumo.cobrancas++;
    }

    // 3. Notas fiscais
    const compromissoPorPagamento = new Map(
      (await db.select({ id: compromissos.id, idExterno: compromissos.idExterno }).from(compromissos).where(eq(compromissos.origem, ID))).map(
        (c) => [c.idExterno, c.id],
      ),
    );
    for (const n of notas) {
      const campos = notaDoAsaas(n);
      if (!campos) continue;
      const valores = {
        ...campos,
        clienteId: n.customer ? (mapaClientes.get(n.customer) ?? null) : null,
        compromissoId: n.payment ? (compromissoPorPagamento.get(n.payment) ?? null) : null,
      };
      await db
        .insert(notasFiscais)
        .values(valores)
        .onConflictDoUpdate({ target: [notasFiscais.origem, notasFiscais.idExterno], set: { ...valores, atualizadoEm: new Date() } });
      resumo.notas++;
    }

    // 4. Extrato: do dia seguinte ao último já trazido até ontem (dias completos, para a deduplicação
    //    ser estável). Na primeira vez, começa depois do último lançamento importado por arquivo
    //    nesta conta, para não duplicar com extratos que você já tinha importado.
    let inicioExtrato = salvo?.extratoAte ? somarDias(salvo.extratoAte, 1) : inicioHistorico;
    if (!salvo?.extratoAte) {
      const [ultima] = await db
        .select({ data: transacoes.data })
        .from(transacoes)
        .where(eq(transacoes.contaId, contaId))
        .orderBy(desc(transacoes.data))
        .limit(1);
      if (ultima && ultima.data >= inicioExtrato) inicioExtrato = somarDias(ultima.data, 1);
    }
    const fimExtrato = somarDias(hoje, -1);
    let extratoAte = salvo?.extratoAte ?? null;
    if (inicioExtrato <= fimExtrato) {
      const lancamentos: AsaasLancamento[] = [];
      for await (const l of asaasListar<AsaasLancamento>(
        "/financialTransactions",
        { startDate: inicioExtrato, finishDate: fimExtrato, order: "asc" },
        signal,
      )) {
        lancamentos.push(l);
      }
      extratoAte = fimExtrato;
      if (lancamentos.length > 0) {
        const extrato = extratoDoAsaas(lancamentos, { inicio: inicioExtrato, fim: fimExtrato });
        resumo.avisos.push(...extrato.avisos);
        const gravado = await gravarExtrato(db, extrato, {
          contaId,
          nomeArquivo: `Asaas (API) ${inicioExtrato} a ${fimExtrato}`,
          hashArquivo: `api:asaas:${inicioExtrato}:${fimExtrato}:${Date.now()}`,
        });
        resumo.lancamentosNovos = gravado.novas;

        // Conciliação: liga a cobrança à entrada no extrato.
        // `indice` aponta para extrato.transacoes, que só tem os lançamentos válidos (mesma ordem).
        const validos = lancamentos.filter(lancamentoValido);
        for (const { indice, id } of gravado.inseridas) {
          const lancamento = validos[indice];
          const compromissoId = lancamento?.paymentId ? compromissoPorPagamento.get(lancamento.paymentId) : undefined;
          if (compromissoId && lancamento.type === "PAYMENT_RECEIVED") {
            await db.update(compromissos).set({ transacaoId: id }).where(eq(compromissos.id, compromissoId));
            resumo.conciliados++;
          }
        }
      }
    }

    await db
      .update(integracoes)
      .set({
        status: "ok",
        mensagem: resumo.avisos.length ? resumo.avisos.slice(0, 5).join(" ") : null,
        ultimaSincronizacao: new Date(),
        extratoAte,
        contaId,
        dados: { saldoCentavos: resumo.saldoCentavos, ultimoResumo: resumo },
      })
      .where(eq(integracoes.id, ID));

    await atualizarCompromissos(db).catch((erro) => console.error("Falha ao conciliar contas a pagar", erro));
    if (opcoes.classificar !== false && resumo.lancamentosNovos > 0) {
      await classificarPendentes(db, { signal }).catch((erro) => console.error("Classificação após Asaas falhou", erro));
    }
    return resumo;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await db
      .insert(integracoes)
      .values({ id: ID, status: "erro", mensagem })
      .onConflictDoUpdate({ target: integracoes.id, set: { status: "erro", mensagem } });
    throw erro;
  } finally {
    estado.__asaasSincronizando = false;
  }
}

/** Mesmo critério de extratoDoAsaas para aceitar um lançamento. */
function lancamentoValido(l: AsaasLancamento): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(l.date ?? "") && l.value !== undefined;
}
