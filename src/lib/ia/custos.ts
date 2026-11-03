import { gte, sql } from "drizzle-orm";
import { primeiroDoMes } from "../datas";
import type { Db } from "../db";
import { usoIa } from "../db/schema";

export interface CustoPorTarefa {
  tarefa: string;
  modelo: string;
  chamadas: number;
  tokens: number;
  custoUsd: number;
}

/** Consumo de IA do mês corrente, por tarefa e modelo. */
export async function custosDoMes(db: Db): Promise<CustoPorTarefa[]> {
  const linhas = await db
    .select({
      tarefa: usoIa.tarefa,
      modelo: usoIa.modelo,
      chamadas: sql<number>`count(*)::int`,
      tokens: sql<number>`sum(${usoIa.tokensEntrada} + ${usoIa.tokensSaida} + ${usoIa.tokensCache})::bigint`,
      custo: sql<number>`sum(${usoIa.custoMicroUsd})::bigint`,
    })
    .from(usoIa)
    .where(gte(usoIa.criadoEm, new Date(primeiroDoMes() + "T03:00:00Z")))
    .groupBy(usoIa.tarefa, usoIa.modelo)
    .orderBy(sql`5 desc`);
  return linhas.map((l) => ({ tarefa: l.tarefa, modelo: l.modelo, chamadas: l.chamadas, tokens: Number(l.tokens), custoUsd: Number(l.custo) / 1_000_000 }));
}
