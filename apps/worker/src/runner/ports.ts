import type { Page } from "playwright";
import type {
  AtAccessMode,
  ExistingCompany,
  IntegrationProvider,
  ObligationPeriodStatus,
  ReconcilePlan,
  ScanJobResult,
} from "@toc/core/domain";
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

/** Utilizador e senha de um portal. A mesma forma serve o TOConline e a AT. */
export interface PortalCredentials {
  username: string;
  password: string;
}

/** Nome antigo, mantido para a varredura não ter de mudar uma linha. */
export type TocOnlineCredentials = PortalCredentials;

/**
 * A quem pertence a credencial: `companyId: null` = credencial da equipa,
 * boa para todas as empresas que não tenham uma sua.
 */
export interface CredentialScope {
  teamId: string;
  companyId: string | null;
}

/**
 * O `provider` vem no resultado em vez de ser assumido por quem pede: o runner
 * do Módulo 1 recebe o `credentialId` já escolhido no payload e não sabe que
 * rota está ligada, por isso confirma que a credencial é a que o adaptador
 * declara consumir (`AtSessionFactory.credentialProvider`) antes de a usar.
 */
export type CredentialLookup =
  | {
      ok: true;
      credentials: PortalCredentials;
      provider: IntegrationProvider;
      scope: CredentialScope;
    }
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
  open(input: { credentialId: string; credentials: TocOnlineCredentials }): Promise<OpenedSession>;
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

/* ------------------------------------------------------------------------- *
 * Módulo 1 — guia de pagamento do IVA no Portal das Finanças.
 *
 * As portas do runner do IVA vivem no mesmo ficheiro das da varredura pelo
 * mesmo motivo: quem as implementa (`at/*`, `sinks/*`) não pode importar do
 * orquestrador. As duas rotas de acesso (Acesso Direto do TOConline e login
 * nosso na AT) partilham **todas** estas portas — o que muda entre elas é só a
 * implementação de `AtSessionFactory`.
 * ------------------------------------------------------------------------- */

/**
 * Fonte de credenciais com o que a AT exige a mais do que o TOConline:
 * descobrir a credencial certa da empresa e marcar o que o portal disse dela.
 */
export interface AtCredentialSource extends CredentialSource {
  /**
   * Precedência: credencial da EMPRESA (`company_id = companyId`) → credencial
   * da EQUIPA (`company_id null`). `null` quando não há nenhuma.
   */
  findFor(input: {
    teamId: string;
    companyId: string;
    provider: IntegrationProvider;
  }): Promise<{ credentialId: string } | null>;
  markExpired(credentialId: string, reason: string): Promise<void>;
  /**
   * Rota A: a senha da AT vive no TOConline, não em `integration_credentials`.
   * Quando a AT a recusa, marca-se uma **linha-marcador** `at`/empresa (status
   * `invalid` + `metadata.invalidReason`, sem segredo) — cria-se se não existir.
   * Nunca se marca a credencial do TOConline, que está boa: o portal falou da
   * senha da empresa, não da nossa.
   */
  markCompanyAtInvalid(input: {
    teamId: string;
    companyId: string;
    reason: string;
    attemptsLeft?: number;
  }): Promise<void>;
}

/** O que o runner precisa de saber da empresa para chegar ao portal. */
export interface AtCompanyHandle {
  id: string;
  nif: string | null;
  tocCompanyId: number | null;
  tocCluster: number | null;
}

/** URLs do portal já resolvidos pela sessão — o runner não as constrói. */
export interface AtSessionUrls {
  consultarDeclaracao: string;
  obterDocumentoPagamento: string;
}

export interface AuthenticatedAtSession {
  /** Página já autenticada e no Portal das Finanças da empresa. */
  readonly page: Page;
  /** Por que rota se lá chegou — vai para o desfecho e para o trace. */
  readonly access: AtAccessMode;
  readonly urls: AtSessionUrls;
  /** Host efetivo (o portal redireciona). Nunca assumido. */
  readonly host: string;
  close(): Promise<void>;
}

export interface OpenedAtSession {
  session: AuthenticatedAtSession;
  /** `true` = reaproveitou `storageState`; um login por sessão, não 182. */
  reused: boolean;
}

/** O que impede a empresa de sequer ser tentada, sabido sem abrir o browser. */
export type AtPrecondition =
  { ok: true } | { ok: false; outcome: "company_not_linked" | "company_nif_missing" };

export interface AtSessionFactory {
  readonly access: AtAccessMode;
  /**
   * Que credencial este adaptador consome. É o adaptador que declara e o runner
   * que confirma — assim o runner não precisa de saber qual rota está ligada.
   */
  readonly credentialProvider: "at" | "toconline";
  /** Pura e antes de qualquer browser: falta de NIF não gasta uma sessão. */
  precondition(company: AtCompanyHandle): AtPrecondition;
  open(input: {
    company: AtCompanyHandle;
    credentialId: string;
    credentials: PortalCredentials;
    scope: CredentialScope;
  }): Promise<OpenedAtSession>;
}

/**
 * A declaração mais recente que o portal mostra. `rowsSeen` distingue "a tabela
 * estava vazia" de "a tabela não foi lida" quando o desfecho é `none`.
 */
export type DeclarationRead =
  | {
      kind: "found";
      period: string;
      submittedAt: string | null;
      /** Substituição: a última submissão do período vence a anterior. */
      replacement: boolean;
      rowsSeen: number;
    }
  | { kind: "none"; rowsSeen: number };

export interface IvaDeclarationReader {
  readMostRecent(
    session: AuthenticatedAtSession,
    company: AtCompanyHandle,
  ): Promise<DeclarationRead>;
}

/**
 * Campos como o portal os deu, ainda por normalizar (`source` diz de onde
 * vieram: do HTML, do texto do PDF, ou de lado nenhum).
 */
export interface RawPortalDocumentFields {
  period: string | null;
  entity: string | null;
  reference: string | null;
  amount: string | null;
  nif: string | null;
  source: "html" | "pdf_text" | "none";
}

/** Qual das três estratégias de captura ganhou a corrida. */
export type PdfVia = "download" | "inline" | "popup";

/**
 * "Sem documento" não é exceção: é um valor devolvido pela porta. Só assim o
 * runner distingue "não há imposto a pagar" (estado válido) de "falhou".
 */
export type PaymentDocumentFetch =
  | { kind: "document"; pdf: Buffer; fields: RawPortalDocumentFields; via: PdfVia }
  | { kind: "no_document" }
  | { kind: "already_paid" }
  | { kind: "not_ready" };

export interface PaymentDocumentFetcher {
  fetch(
    session: AuthenticatedAtSession,
    target: { period: string; company: AtCompanyHandle },
  ): Promise<PaymentDocumentFetch>;
}

export interface DocumentStore {
  put(input: {
    teamId: string;
    companyId: string;
    kind: "iva";
    period: string;
    pdf: Buffer;
  }): Promise<{ storagePath: string; bytes: number }>;
}

export interface PeriodState {
  periodId: string;
  status: ObligationPeriodStatus;
  documentId: string | null;
  hasFile: boolean;
}

export interface ObligationLedger {
  getCompany(
    teamId: string,
    companyId: string,
  ): Promise<(AtCompanyHandle & { status: string }) | null>;
  getPeriod(teamId: string, companyId: string, period: string): Promise<PeriodState | null>;
  beginPeriod(
    teamId: string,
    companyId: string,
    period: string,
    dueDate: string | null,
    frequency: "monthly" | "quarterly",
  ): Promise<{ periodId: string }>;
  recordDocument(
    teamId: string,
    periodId: string,
    doc: {
      type: string;
      entity: string | null;
      reference: string | null;
      amount: string | null;
      validUntil: string | null;
      storagePath: string;
      extractedAt: Date;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ documentId: string }>;
  /**
   * O estado do período nunca regride de `delivered`/`paid`: quem implementa
   * ignora o `"error"` nesses casos — uma falha a seguir a uma guia guardada
   * não pode apagar do dashboard o facto de a guia existir.
   */
  markPeriod(
    teamId: string,
    periodId: string,
    status: "skipped_nonexistent" | "paid" | "pending" | "error",
  ): Promise<void>;
}

/** Cap diário por empresa: o portal é de um terceiro e não se martela. */
export interface AttemptGuard {
  attemptsToday(teamId: string, companyId: string, excludeJobId: string): Promise<number>;
}

/**
 * Trava geral do acesso à AT.
 *
 * Uma indisponibilidade do portal não pode fazer 182 jobs queimarem tentativa
 * um atrás do outro: o primeiro `trip()` põe os seguintes em `deferred` até a
 * pausa passar.
 */
export interface PortalGate {
  isPaused(): Promise<{ paused: false } | { paused: true; untilMs: number }>;
  trip(reason: string): Promise<void>;
  reset(): Promise<void>;
}
