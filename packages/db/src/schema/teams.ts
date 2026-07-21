import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { teamStatus } from "./enums";

// Equipe = gabinete de contabilidade (o tenant). Tem vários usuários (profiles.team_id)
// e várias empresas clientes (companies.team_id) abaixo dela.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // nome do gabinete
  nif: text("nif"), // NIF do próprio gabinete
  status: teamStatus("status").notNull().default("active"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
