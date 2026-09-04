import type { AtAccessMode } from "@toc/core/domain";
import type {
  AtCompanyHandle,
  AtCredentialSource,
  AtPrecondition,
  AtSessionFactory,
  AttemptGuard,
  AuthenticatedAtSession,
  CredentialLookup,
  DeclarationRead,
  DocumentStore,
  IvaDeclarationReader,
  ObligationLedger,
  OpenedAtSession,
  PaymentDocumentFetch,
  PaymentDocumentFetcher,
  PeriodState,
  PortalCredentials,
  PortalGate,
  RawPortalDocumentFields,
} from "../../src/runner/ports";

/**
 * Dublês em memória das portas do `IvaDocumentRunner`.
 *
 * Vivem num ficheiro à parte do teste porque são oito e o que interessa no
 * teste é o mapa de casos, não a mecânica dos dublês. Todos **registam as
 * chamadas** em vez de as contarem apenas: a asserção que importa quase sempre
 * é "marcou-se exatamente esta credencial com esta razão", não "marcou-se uma".
 */

export const TEAM = "22222222-2222-2222-2222-222222222222";
export const COMPANY = "33333333-3333-3333-3333-333333333333";
export const CREDENTIAL = "cred-1";

/** Dados pessoais / segredos que **nunca** podem aparecer num evento ou log. */
export const SENHA = "senha-secreta-do-gabinete";
export const NIF = "501442600";
export const NOME_EMPRESA = "Padaria Central Unipessoal Lda";
export const REFERENCIA = "123456789012345";
export const VALOR = "1234,56";
export const ENTIDADE = "11111";

/** Empresa como o ledger a devolve (handle + estado). */
export function empresa(
  over: Partial<AtCompanyHandle & { status: string }> = {},
): AtCompanyHandle & { status: string } {
  return { id: COMPANY, nif: NIF, tocCompanyId: 7, tocCluster: 5, status: "active", ...over };
}

/** PDF plausível: assinatura `%PDF-` e mais de 1 KB. */
export function pdfValido(): Buffer {
  return Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(1200, 0x20)]);
}

/** Os campos tal como o portal os dá — com o NIF e o valor por redigir. */
export function camposDoPortal(
  over: Partial<RawPortalDocumentFields> = {},
): RawPortalDocumentFields {
  return {
    period: "2026-07",
    entity: ENTIDADE,
    reference: REFERENCIA,
    amount: VALOR,
    nif: NIF,
    source: "html",
    ...over,
  };
}

export function documento(over: Partial<RawPortalDocumentFields> = {}): PaymentDocumentFetch {
  return { kind: "document", pdf: pdfValido(), fields: camposDoPortal(over), via: "download" };
}

export const CREDENCIAL_AT: CredentialLookup = {
  ok: true,
  credentials: { username: "gabinete@example.pt", password: SENHA },
  provider: "at",
  scope: { teamId: TEAM, companyId: null },
};

export const CREDENCIAL_TOCONLINE: CredentialLookup = {
  ok: true,
  credentials: { username: "gabinete@example.pt", password: SENHA },
  provider: "toconline",
  scope: { teamId: TEAM, companyId: null },
};

export class FakeCredentials implements AtCredentialSource {
  readonly verified: string[] = [];
  readonly invalidated: { id: string; reason: string }[] = [];
  readonly expired: { id: string; reason: string }[] = [];
  readonly companyMarkers: {
    teamId: string;
    companyId: string;
    reason: string;
    attemptsLeft?: number;
  }[] = [];

  constructor(private readonly lookup: CredentialLookup = CREDENCIAL_AT) {}

  async load(): Promise<CredentialLookup> {
    return this.lookup;
  }
  async findFor(): Promise<{ credentialId: string } | null> {
    return { credentialId: CREDENTIAL };
  }
  async markVerified(id: string) {
    this.verified.push(id);
  }
  async markInvalid(id: string, reason: string) {
    this.invalidated.push({ id, reason });
  }
  async markExpired(id: string, reason: string) {
    this.expired.push({ id, reason });
  }
  async markCompanyAtInvalid(input: {
    teamId: string;
    companyId: string;
    reason: string;
    attemptsLeft?: number;
  }) {
    this.companyMarkers.push(input);
  }

  /** Toda e qualquer marca deixada nesta fonte — o "não tocou em nada" é uma asserção. */
  get todasAsMarcas(): unknown[] {
    return [...this.invalidated, ...this.expired, ...this.companyMarkers];
  }
}

export interface FakeSessionsOptions {
  access?: AtAccessMode;
  credentialProvider?: "at" | "toconline";
  precondition?: AtPrecondition;
  failure?: Error;
}

export class FakeSessions implements AtSessionFactory {
  readonly access: AtAccessMode;
  readonly credentialProvider: "at" | "toconline";
  opened = 0;
  closed = 0;
  readonly openInputs: {
    company: AtCompanyHandle;
    credentialId: string;
    credentials: PortalCredentials;
  }[] = [];

  constructor(private readonly options: FakeSessionsOptions = {}) {
    this.access = options.access ?? "at_direct_login";
    this.credentialProvider =
      options.credentialProvider ??
      (this.access === "toconline_direct_access" ? "toconline" : "at");
  }

  precondition(): AtPrecondition {
    return this.options.precondition ?? { ok: true };
  }

  async open(input: {
    company: AtCompanyHandle;
    credentialId: string;
    credentials: PortalCredentials;
  }): Promise<OpenedAtSession> {
    this.openInputs.push(input);
    if (this.options.failure) throw this.options.failure;
    this.opened += 1;
    const session: AuthenticatedAtSession = {
      // O runner nunca toca na Page — só a repassa aos adaptadores, aqui falsos.
      page: {} as AuthenticatedAtSession["page"],
      access: this.access,
      urls: {
        consultarDeclaracao: "https://sitfiscal.example/consultar",
        obterDocumentoPagamento: "https://sitfiscal.example/documento",
      },
      host: "sitfiscal.portaldasfinancas.example",
      close: async () => {
        this.closed += 1;
      },
    };
    return { session, reused: false };
  }
}

export class FakeDeclarations implements IvaDeclarationReader {
  calls = 0;
  constructor(
    private readonly outcome: DeclarationRead | Error = {
      kind: "found",
      period: "2026-07",
      submittedAt: "2026-09-01",
      replacement: false,
      rowsSeen: 3,
    },
  ) {}

  async readMostRecent(): Promise<DeclarationRead> {
    this.calls += 1;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

export class FakeDocuments implements PaymentDocumentFetcher {
  calls = 0;
  readonly targets: { period: string }[] = [];
  constructor(private readonly outcome: PaymentDocumentFetch | Error = documento()) {}

  async fetch(
    _session: AuthenticatedAtSession,
    target: { period: string; company: AtCompanyHandle },
  ): Promise<PaymentDocumentFetch> {
    this.calls += 1;
    this.targets.push({ period: target.period });
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

export class FakeStorage implements DocumentStore {
  readonly puts: { period: string; bytes: number }[] = [];
  constructor(private readonly failure?: Error) {}

  async put(input: {
    teamId: string;
    companyId: string;
    kind: "iva";
    period: string;
    pdf: Buffer;
  }): Promise<{ storagePath: string; bytes: number }> {
    if (this.failure) throw this.failure;
    this.puts.push({ period: input.period, bytes: input.pdf.length });
    return {
      storagePath: `${input.teamId}/${input.companyId}/iva/${input.period}.pdf`,
      bytes: input.pdf.length,
    };
  }
}

export interface FakeLedgerOptions {
  /** `null` = a empresa não existe na equipa. */
  company?: (AtCompanyHandle & { status: string }) | null;
  /** Estado por período; ausente = período sem linha. */
  periods?: Record<string, PeriodState>;
  recordFailure?: Error;
}

export class FakeLedger implements ObligationLedger {
  readonly periodsAsked: string[] = [];
  readonly begun: { period: string; dueDate: string | null; frequency: string }[] = [];
  readonly recorded: { periodId: string; doc: Record<string, unknown> }[] = [];
  readonly marked: { periodId: string; status: string }[] = [];

  constructor(private readonly options: FakeLedgerOptions = {}) {}

  async getCompany(): Promise<(AtCompanyHandle & { status: string }) | null> {
    return this.options.company === undefined ? empresa() : this.options.company;
  }

  async getPeriod(
    _teamId: string,
    _companyId: string,
    period: string,
  ): Promise<PeriodState | null> {
    this.periodsAsked.push(period);
    return this.options.periods?.[period] ?? null;
  }

  async beginPeriod(
    _teamId: string,
    _companyId: string,
    period: string,
    dueDate: string | null,
    frequency: "monthly" | "quarterly",
  ): Promise<{ periodId: string }> {
    this.begun.push({ period, dueDate, frequency });
    return { periodId: `period-${period}` };
  }

  async recordDocument(
    _teamId: string,
    periodId: string,
    doc: Parameters<ObligationLedger["recordDocument"]>[2],
  ): Promise<{ documentId: string }> {
    if (this.options.recordFailure) throw this.options.recordFailure;
    this.recorded.push({ periodId, doc: doc as unknown as Record<string, unknown> });
    return { documentId: "doc-1" };
  }

  async markPeriod(
    _teamId: string,
    periodId: string,
    status: "skipped_nonexistent" | "paid" | "pending" | "error",
  ): Promise<void> {
    this.marked.push({ periodId, status });
  }
}

export class FakeAttempts implements AttemptGuard {
  readonly calls: { companyId: string; excludeJobId: string }[] = [];
  constructor(private readonly count = 0) {}

  async attemptsToday(_teamId: string, companyId: string, excludeJobId: string): Promise<number> {
    this.calls.push({ companyId, excludeJobId });
    return this.count;
  }
}

export class FakeGate implements PortalGate {
  readonly tripped: string[] = [];
  constructor(private readonly pausedUntilMs: number | null = null) {}

  async isPaused(): Promise<{ paused: false } | { paused: true; untilMs: number }> {
    return this.pausedUntilMs === null
      ? { paused: false }
      : { paused: true, untilMs: this.pausedUntilMs };
  }
  async trip(reason: string) {
    this.tripped.push(reason);
  }
  async reset() {
    this.tripped.length = 0;
  }
}
