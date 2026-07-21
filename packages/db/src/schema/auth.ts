import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { appRole } from "./enums";
import { teams } from "./teams";

// Espelha auth.users(id). Sem FK explícita ao schema `auth` (gerido pelo Supabase);
// a ligação é feita por trigger SQL (ver migration de RLS/trigger).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  role: appRole("role").notNull().default("viewer"),
  // Equipe (tenant) do usuário. NULL = admin global (enxerga todas as equipes).
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  // Força a troca de senha no 1º acesso. Setada como true pelo trigger
  // handle_new_user quando o admin cria o usuário (ver migration *_rls.sql).
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
