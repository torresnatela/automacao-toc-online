import type { Page } from "playwright";
import type { ExistingCompany, ReconcilePlan, ScanJobResult } from "@toc/core/domain";
import type { GridProjection } from "../toconline/project-grid";

/**
 * As portas por onde a varredura toca no mundo: credenciais, sessão de browser,
 * leitura do grid e persistência.
 *
 * Vivem aqui e não no `CompanyScanRunner` porque quem as **implementa**
 * (`toconline/session.ts`, `toconline/scanner.ts`, `sinks/*`) teria de importar
 * do orquestrador para as cumprir — a dependência ao contrário, e o ficheiro das
 * decisões de retry/skip a mudar sempre que um adaptador muda.
 */

export interface TocOnlineCredentials {
  username: string;
  password: string;
}

export type CredentialLookup =
  | { ok: true; credentials: TocOnlineCredentials }
  | { ok: false; reason: "not_found" | "invalid" | "expired" };

export interface CredentialSource {
  load(credentialId: string): Promise<CredentialLookup>;
  markVerified(credentialId: string): Promise<void>;
  markInvalid(credentialId: string, reason: string): Promise<void>;
}

export interface AuthenticatedTocSession {
  /** Página já autenticada e na listagem de empresas. */
  readonly page: Page;
  /** Host efetivo pós-login (ex.: `app5.toconline.pt`). Nunca assumido. */
  readonly host: string;
  close(): Promise<void>;
}

export interface OpenedSession {
  session: AuthenticatedTocSession;
  reused: boolean;
}

export interface TocSessionFactory {
  open(input: {
    credentialId: string;
    credentials: TocOnlineCredentials;
  }): Promise<OpenedSession>;
}

export interface CompanyScanner {
  scan(session: AuthenticatedTocSession): Promise<GridProjection>;
}

/** O que a persistência efetivamente escreveu — subconjunto de `ScanJobResult`. */
export type UpsertReport = Pick<
  ScanJobResult,
  "created" | "linked" | "updated" | "unchanged" | "missing" | "conflicts"
>;

export interface CompanyDirectory {
  /** Empresas já conhecidas da equipa — base da reconciliação e do guard de encolhimento. */
  list(teamId: string): Promise<ExistingCompany[]>;
  apply(teamId: string, plan: ReconcilePlan): Promise<UpsertReport>;
}
