/**
 * Teste de ponta a ponta com PostgreSQL de verdade. Roda só quando TEST_DATABASE_URL está definida
 * (banco descartável: as tabelas são esvaziadas). Ex.:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5433/financeiro_teste pnpm test
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIAS_PADRAO } from "../classificacao/categorias";
import { classificarPendentes, reabrirClassificacaoDaConta } from "../classificacao/executar";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { importarParaBanco } from "../importacao/persistir";

const url = process.env.TEST_DATABASE_URL;
const fixture = (nome: string) => new Uint8Array(readFileSync(`tests/fixtures/${nome}`));

describe.skipIf(!url)("importação + classificação no banco", () => {
  let pool: Pool;
  let db: Db;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.execute(sql`truncate transacoes, importacoes, regras, contas, titulares, categorias, configuracoes restart identity cascade`);
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
});
