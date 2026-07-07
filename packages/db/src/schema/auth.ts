import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { appRole } from "./enums";

// Espelha auth.users(id). Sem FK explícita ao schema `auth` (gerido pelo Supabase);
// a ligação é feita por trigger SQL (ver migration de RLS/trigger).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  fullName: text("full_name"),
  role: appRole("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
