import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>;

/**
 * Uma pool do `pg` por processo.
 *
 * A pool emite `error` quando um cliente **inativo** perde a ligação (o
 * Postgres reiniciou, o Docker caiu, a rede piscou). Sem ouvinte, o Node trata
 * um `error` sem dono como fatal e derruba o processo inteiro — no worker isso
 * mata um job a meio de uma sessão de browser e deixa o trace aberto. Com o
 * ouvinte, a ligação morta é descartada da pool, a próxima query falha por si
 * (retentável, com backoff) e a fila continua. A mensagem vai para o stderr
 * sem a connection string, que leva a senha.
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        source: "db",
        level: "warn",
        message: "ligação inativa à base de dados perdida — será refeita na próxima query",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
  return drizzle(pool, { schema });
}
