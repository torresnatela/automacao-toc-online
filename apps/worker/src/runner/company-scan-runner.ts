import { EventHandle, TraceHandle, type Tracer } from "@toc/core";
import type { EventInput, ObservabilityStore } from "@toc/core";
import {
  normalizeScan,
  planCompanyReconciliation,
  type ExistingCompany,
  type ReconcilePlan,
} from "@toc/core/domain";
import { InvalidCredentialsError, StructuralError } from "../errors";
import { assertScanIntegrity } from "../toconline/guards";
import type { GridProjection } from "../toconline/project-grid";
import type { ClaimedJob } from "./job-queue";

/**
 * Orquestra uma varredura de empresas: job → sessão no TOConline → leitura do
 * grid → reconciliação → persistência, com a cadeia de observabilidade inteira.
 *
 * Tudo o que toca no mundo entra por uma porta injetada, e é por isso que este
 * ficheiro — onde vivem as decisões de retry, skip e ordem dos passos — se
 * testa sem browser, sem rede e sem base de dados.
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

export interface UpsertReport {
  created: number;
  linked: number;
  updated: number;
  unchanged: number;
  missing: number;
  conflicts: number;
}

export interface CompanyDirectory {
  /** Empresas já conhecidas da equipa — base da reconciliação e do guard de encolhimento. */
  list(teamId: string): Promise<ExistingCompany[]>;
  apply(teamId: string, plan: ReconcilePlan): Promise<UpsertReport>;
}

export interface ScanRunnerDeps {
  tracer: Tracer;
  /** Necessário para CONTINUAR o trace aberto pelo dashboard, não só para abrir novos. */
  store: ObservabilityStore;
  credentials: CredentialSource;
  sessions: TocSessionFactory;
  scanner: CompanyScanner;
  directory: CompanyDirectory;
}

export interface ScanResult extends UpsertReport {
  scanned: number;
  persisted: number;
  rejected: number;
  demo: number;
  host: string;
  via: string;
}

export type ScanOutcome =
  | { status: "succeeded"; result: ScanResult }
  | { status: "skipped"; reason: string }
  | { status: "failed"; message: string; retry: boolean };

interface ScanPayload {
  teamId: string;
  credentialId: string;
}

function parsePayload(raw: unknown): ScanPayload {
  const p = (raw ?? {}) as Record<string, unknown>;
  const teamId = typeof p.teamId === "string" ? p.teamId : "";
  const credentialId = typeof p.credentialId === "string" ? p.credentialId : "";
  if (!teamId || !credentialId) {
    throw new StructuralError("Payload de varredura inválido: faltam teamId e/ou credentialId.");
  }
  return { teamId, credentialId };
}

export class CompanyScanRunner {
  constructor(private readonly deps: ScanRunnerDeps) {}

  async run(job: ClaimedJob): Promise<ScanOutcome> {
    let payload: ScanPayload;
    try {
      payload = parsePayload(job.payload);
    } catch (err) {
      // Sem payload não há trace a continuar nem equipa a correlacionar.
      return { status: "failed", message: (err as Error).message, retry: false };
    }

    // A credencial resolve-se ANTES de tocar no browser: uma credencial já
    // marcada inválida não deve fazer o worker martelar o TOConline a cada
    // retentativa.
    const lookup = await this.deps.credentials.load(payload.credentialId);
    if (!lookup.ok) {
      if (lookup.reason === "not_found") {
        return {
          status: "failed",
          message: "Credencial do TOConline não encontrada.",
          retry: false,
        };
      }
      return { status: "skipped", reason: "credential_invalid" };
    }

    // Continuar o trace do dashboard em vez de abrir um novo: abrir aqui
    // partiria a cadeia causal (enfileirar → executar) em dois pedaços soltos.
    const trace = job.traceId
      ? new TraceHandle(this.deps.store, job.traceId)
      : await this.deps.tracer.startTrace({
          rootTrigger: "manual",
          triggerSource: "worker:scan_companies",
          correlationKey: `team:${payload.teamId}:toconline`,
        });

    const enqueued = job.triggeringEventId
      ? new EventHandle(this.deps.store, job.triggeringEventId, trace.id)
      : null;

    const startedInput: EventInput = {
      type: "job.started",
      source: "worker",
      payload: { jobId: job.id, teamId: payload.teamId, attempt: job.attempts },
    };
    const started = enqueued ? await enqueued.child(startedInput) : await trace.event(startedInput);

    let session: AuthenticatedTocSession | null = null;
    try {
      // --- Sessão -----------------------------------------------------------
      const sessionEvent = await started.child({
        type: "rpa.toconline.session",
        source: "worker",
        payload: { credentialId: payload.credentialId },
      });
      const opened = await this.deps.sessions.open({
        credentialId: payload.credentialId,
        credentials: lookup.credentials,
      });
      session = opened.session;
      await this.deps.credentials.markVerified(payload.credentialId);
      await sessionEvent.log.info("sessão estabelecida", {
        host: opened.session.host,
        reused: opened.reused,
      });
      await sessionEvent.succeed();

      // --- Leitura do grid --------------------------------------------------
      const scanEvent = await started.child({
        type: "rpa.toconline.scan_companies",
        source: "worker",
        payload: {},
      });
      const existing = await this.deps.directory.list(payload.teamId);
      const previousCount = existing.filter((c) => c.tocCompanyId !== null).length;

      const read = await this.deps.scanner.scan(session);
      const scan = normalizeScan(read.rows);
      // Falha alta antes de persistir: uma lista truncada aceite em silêncio é
      // o pior desfecho possível deste módulo.
      assertScanIntegrity(read, scan, previousCount);

      await scanEvent.log.info("grid lido", {
        via: read.via,
        rows: read.rows.length,
        reportedSize: read.reportedSize,
        rejected: scan.rejected.length,
        warnings: scan.warnings.length,
      });
      await scanEvent.succeed();

      // --- Reconciliação ----------------------------------------------------
      const syncEvent = await started.child({
        type: "integration.companies_synced",
        source: "worker",
        payload: {},
      });
      // Passa-se a lista COMPLETA: quem decide o que não entra é a
      // reconciliação, que emite `skip` e o contabiliza. Filtrar aqui antes
      // duplicaria a política em dois sítios e faria o resumo mentir.
      const plan = planCompanyReconciliation(scan.companies, existing);
      const report = await this.deps.directory.apply(payload.teamId, plan);

      // As contagens vão por log porque `succeed()` não aceita payload. Nunca
      // nomes nem NIFs — só números.
      await syncEvent.log.info("empresas reconciliadas", { ...report });
      await syncEvent.succeed();

      const result: ScanResult = {
        ...report,
        scanned: read.rows.length,
        persisted: scan.companies.length - plan.summary.skip,
        rejected: scan.rejected.length,
        demo: plan.summary.skip,
        host: opened.session.host,
        via: read.via,
      };

      await started.succeed();
      await trace.complete();
      return { status: "succeeded", result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      // Uma credencial rejeitada não fica certa à terceira tentativa: marca-se
      // inválida para as próximas nem chegarem ao browser.
      if (err instanceof InvalidCredentialsError) {
        await this.safely(() =>
          this.deps.credentials.markInvalid(payload.credentialId, "login_rejeitado"),
        );
      }
      const retry = !(err instanceof StructuralError);

      await this.safely(() => started.fail({ message }));
      await this.safely(() => trace.fail({ message }));
      return { status: "failed", message, retry };
    } finally {
      // A sessão fecha sempre: um contexto de browser deixado aberto vaza
      // memória e, pior, deixa cookies do gabinete vivos.
      if (session) await this.safely(() => session!.close());
    }
  }

  /** Instrumentação e limpeza são fail-open: não podem derrubar o desfecho do job. */
  private async safely(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch {
      // deliberadamente silencioso
    }
  }
}
