import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const globalParaDb = globalThis as unknown as { __db?: Db };

/** Conexão única por processo (o hot reload do Next em dev recriaria o pool a cada edição). */
export function obterDb(): Db {
  if (!globalParaDb.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada.");
    globalParaDb.__db = drizzle(new Pool({ connectionString: url, max: 5 }), { schema });
  }
  return globalParaDb.__db;
}

export { schema };
