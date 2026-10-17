/**
 * Aplica as migrações do banco e garante as categorias padrão.
 * Uso: pnpm db:migrar  (precisa de DATABASE_URL)
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { CATEGORIAS_PADRAO } from "../src/lib/classificacao/categorias";
import { categorias } from "../src/lib/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "drizzle" });
  await db
    .insert(categorias)
    .values(CATEGORIAS_PADRAO)
    .onConflictDoUpdate({
      target: categorias.id,
      set: { nome: sql`excluded.nome`, escopo: sql`excluded.escopo`, grupo: sql`excluded.grupo` },
    });
  await pool.end();
  console.log(`Migrações aplicadas; ${CATEGORIAS_PADRAO.length} categorias garantidas.`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
