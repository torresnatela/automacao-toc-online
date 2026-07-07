import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { prepare: false });
  return drizzle(sql, { schema });
}
