import { EventHandle, TraceHandle, type Tracer } from "@toc/core";
import type { EventInput, ObservabilityStore } from "@toc/core";
import { normalizeScan, planCompanyReconciliation, type ScanJobResult } from "@toc/core/domain";
import { InvalidCredentialsError, StructuralError } from "../errors";
import { assertScanIntegrity } from "../toconline/guards";
import type { ClaimedJob } from "./job-queue";
import type {
  AuthenticatedTocSession,
  CompanyDirectory,
  CompanyScanner,
  CredentialSource,
  TocSessionFactory,
} from "./ports";

/**
 * Orquestra uma varredura de empresas: job → sessão no TOConline → leitura do
 * grid → reconciliação → persistência, com a cadeia de observabilidade inteira.
 *
 * Tudo o que toca no mundo entra por uma porta injetada, e é por isso que este
 * ficheiro — onde vivem as decisões de retry, skip e ordem dos passos — se
 * testa sem browser, sem rede e sem base de dados.
 */

export interface ScanRunnerDeps {
  tracer: Tracer;
  /** Necessário para CONTINUAR o trace aberto pelo dashboard, não só para abrir novos. */
  store: ObservabilityStore;
  credentials: CredentialSource;
  sessions: TocSessionFactory;
  scanner: CompanyScanner;
  directory: CompanyDirectory;
}

export type ScanOutcome =
  | { status: "succeeded"; result: ScanJobResult }
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
    // O trace do dashboard não depende do payload nem da credencial: se veio na
    // fila, continuá-lo é a PRIMEIRA coisa a fazer. Foi entregue com `handOff`
    // e fica aberto até o worker o fechar — uma saída antecipada que o ignore
    // deixa-o aberto para sempre, indistinguível de um job enfileirado e nunca
    // consumido, que é justamente o sinal que ele existe para dar.
    const handedOff = job.traceId ? new TraceHandle(this.deps.store, job.traceId) : null;
    const enqueued =
      handedOff && job.triggeringEventId
        ? new EventHandle(this.deps.store, job.triggeringEventId, handedOff.id)
        : null;

    let payload: ScanPayload;
    try {
      payload = parsePayload(job.payload);
    } catch (err) {
      const message = (err as Error).message;
      await this.closeEarly(handedOff, enqueued, job, null, { kind: "failed", message });
      return { status: "failed", message, retry: false };
    }

    // A credencial resolve-se ANTES de tocar no browser: uma credencial já
    // marcada inválida não deve fazer o worker martelar o TOConline a cada
    // retentativa.
    const lookup = await this.deps.credentials.load(payload.credentialId);
    if (!lookup.ok) {
      if (lookup.reason === "not_found") {
        const message = "Credencial do TOConline não encontrada.";
        await this.closeEarly(handedOff, enqueued, job, payload.teamId, {
          kind: "failed",
          message,
        });
        return { status: "failed", message, retry: false };
      }
      await this.closeEarly(handedOff, enqueued, job, payload.teamId, {
        kind: "skipped",
        reason: "credential_invalid",
      });
      return { status: "skipped", reason: "credential_invalid" };
    }

    // Continuar o trace do dashboard em vez de abrir um novo: abrir aqui
    // partiria a cadeia causal (enfileirar → executar) em dois pedaços soltos.
    const trace =
      handedOff ??
      (await this.deps.tracer.startTrace({
        rootTrigger: "manual",
        triggerSource: "worker:scan_companies",
        correlationKey: `team:${payload.teamId}:toconline`,
      }));

    const started = await this.openStarted(trace, enqueued, job, payload.teamId);

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

      const result: ScanJobResult = {
        ...report,
        scanned: read.rows.length,
        // Só conta o que a persistência tocou: `skip` (demo) e `conflict` não
        // escrevem nada, e incluí-los faria o resumo prometer escritas que não
        // aconteceram.
        persisted:
          plan.summary.create + plan.summary.link + plan.summary.update + plan.summary.unchanged,
        rejected: scan.rejected.length,
        skipped: plan.summary.skip,
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

  /**
   * Abre o `job.started` — sempre pendurado no evento de enfileiramento quando
   * ele existe, para a cadeia enfileirar → executar ficar de uma peça só.
   */
  private openStarted(
    trace: TraceHandle,
    enqueued: EventHandle | null,
    job: ClaimedJob,
    teamId: string | null,
  ): Promise<EventHandle> {
    const input: EventInput = {
      type: "job.started",
      source: "worker",
      payload: { jobId: job.id, teamId, attempt: job.attempts },
    };
    return enqueued ? enqueued.child(input) : trace.event(input);
  }

  /**
   * Encerra o trace entregue pelo dashboard numa saída antecipada, com o mesmo
   * `job.started` do caminho normal para o desfecho ser legível no mesmo sítio.
   *
   * O evento de enfileiramento **não** é reescrito: enfileirar sucedeu mesmo, e
   * marcá-lo agora como falhado ou ignorado seria mentir sobre o que o
   * dashboard fez. Quem carrega o desfecho da execução é o `job.started`.
   */
  private async closeEarly(
    trace: TraceHandle | null,
    enqueued: EventHandle | null,
    job: ClaimedJob,
    teamId: string | null,
    outcome: { kind: "failed"; message: string } | { kind: "skipped"; reason: string },
  ): Promise<void> {
    // Sem trace na fila não há nada a fechar — e inventar um aqui só criaria
    // um trace órfão sem a equipa que o correlaciona.
    if (!trace) return;

    await this.safely(async () => {
      const started = await this.openStarted(trace, enqueued, job, teamId);
      if (outcome.kind === "failed") {
        await started.fail({ message: outcome.message });
        await trace.fail({ message: outcome.message });
      } else {
        await started.skip(outcome.reason);
        // Ignorar de propósito não é falhar: o trabalho terminou, e o trace
        // fecha concluído.
        await trace.complete();
      }
    });
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
