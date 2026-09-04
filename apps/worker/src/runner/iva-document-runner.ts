import { EventHandle, TraceHandle, type Tracer } from "@toc/core";
import type { EventInput, ObservabilityStore } from "@toc/core";
import {
  IVA_DOCUMENT_TYPE,
  IVA_OUTCOMES,
  comparePeriods,
  derivePaymentDueDate,
  documentFieldsComplete,
  nextDuePeriod,
  normalizeDocumentFields,
  parseIvaDocumentPayload,
  parsePeriod,
  type AtAccessMode,
  type IvaDocumentJobPayload,
  type IvaDocumentJobResult,
  type IvaFrequency,
  type IvaOutcome,
  type IvaOutcomeDetails,
  type IvaStage,
} from "@toc/core/domain";
import { assertDocumentBelongsTo, assertPdfIntegrity, assertPeriodMatches } from "../at/guards";
import {
  AtAuthError,
  AtIntegrityError,
  AtTransientError,
  InvalidCredentialsError,
  StructuralError,
} from "../errors";
import { sleep as dormirDeVerdade } from "../support/sleep";
import { classifyFailure } from "./classify-failure";
import { desfechoDoJob, markByOutcome } from "./iva-outcome-effects";
import type { ClaimedJob } from "./job-queue";
import type { JobHandler, JobOutcome } from "./worker-loop";
import type {
  AtCredentialSource,
  AttemptGuard,
  AtSessionFactory,
  AuthenticatedAtSession,
  DocumentStore,
  IvaDeclarationReader,
  ObligationLedger,
  PaymentDocumentFetcher,
  PortalGate,
} from "./ports";

/**
 * Orquestra a obtenção da guia de pagamento do IVA: job → pré-condições sem
 * browser → sessão no Portal das Finanças → declaração mais recente → documento
 * → Storage → ledger, com a cadeia de observabilidade inteira.
 *
 * Tudo o que toca no mundo entra por uma porta injetada, e é por isso que este
 * ficheiro — onde vivem as decisões de retry, skip e ordem dos passos — se
 * testa sem browser, sem rede e sem base de dados.
 *
 * A ordem dos passos **é** a política: cada verificação que se pode fazer sem
 * abrir o browser fica antes dele, porque cada sessão contra a AT gasta uma do
 * contador da senha e a conta acaba bloqueada por dias.
 */

export interface IvaRunnerPolicy {
  /** Tentativas por empresa por dia. O portal é de um terceiro e não se martela. */
  dailyAttemptCap?: number;
  /** Ritmo mínimo entre jobs deste tipo, exposto ao ciclo. */
  pacingMs?: number;
  /** Espera aleatória antes de cada login, para o tráfego não sair em cadência. */
  jitterMs?: number;
}

export interface IvaRunnerDeps {
  tracer: Tracer;
  /** Necessário para CONTINUAR o trace aberto pelo dashboard, não só para abrir novos. */
  store: ObservabilityStore;
  credentials: AtCredentialSource;
  sessions: AtSessionFactory;
  declarations: IvaDeclarationReader;
  documents: PaymentDocumentFetcher;
  storage: DocumentStore;
  ledger: ObligationLedger;
  attempts: AttemptGuard;
  gate: PortalGate;
  policy?: IvaRunnerPolicy;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

/** O contexto do job que vai no `job.started` — uuids e códigos, nunca dados do cliente. */
interface ContextoDoJob {
  teamId: string | null;
  companyId: string | null;
  access: AtAccessMode | null;
  batchId?: string;
}

export class IvaDocumentRunner implements JobHandler {
  readonly pacingMs: number;
  private readonly dailyAttemptCap: number;
  private readonly jitterMs: number;
  private readonly agora: () => Date;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(private readonly deps: IvaRunnerDeps) {
    this.pacingMs = deps.policy?.pacingMs ?? 5_000;
    this.dailyAttemptCap = deps.policy?.dailyAttemptCap ?? 5;
    this.jitterMs = deps.policy?.jitterMs ?? 2_000;
    this.agora = deps.clock ?? (() => new Date());
    this.dormir = deps.sleep ?? dormirDeVerdade;
  }

  async run(job: ClaimedJob): Promise<JobOutcome> {
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

    let ctx: ContextoDoJob = { teamId: null, companyId: job.companyId, access: null };
    /** Fecha o trace do dashboard e devolve o desfecho, numa saída antecipada. */
    const sair = async (
      outcome: IvaOutcome,
      details: IvaOutcomeDetails = {},
      message = "",
    ): Promise<JobOutcome> => {
      await this.closeEarly(handedOff, enqueued, job, ctx, outcome, message);
      return desfechoDoJob(outcome, details, message);
    };

    // --- 2. Payload ---------------------------------------------------------
    const payload = parseIvaDocumentPayload(job.payload);
    if (payload === null) {
      return sair("payload_invalid", { stage: "precondition" }, "Pedido de guia inválido.");
    }
    ctx = {
      teamId: payload.teamId,
      companyId: payload.companyId,
      access: payload.access,
      ...(payload.batchId === undefined ? {} : { batchId: payload.batchId }),
    };
    if (payload.access !== this.deps.sessions.access) {
      return sair(
        "payload_invalid",
        { stage: "precondition", access: payload.access },
        "Modo de acesso não suportado por este worker.",
      );
    }

    // --- 3. Trava do portal -------------------------------------------------
    // Antes de tudo o resto: uma indisponibilidade não pode fazer 182 jobs
    // queimarem tentativa um atrás do outro contra um portal em baixo.
    const pausa = await this.deps.gate.isPaused();
    if (pausa.paused) {
      await this.closeEarly(handedOff, enqueued, job, ctx, "portal_paused", "");
      return { status: "deferred", reason: "portal_paused", untilMs: pausa.untilMs };
    }

    // --- 4. Empresa ---------------------------------------------------------
    const company = await this.deps.ledger.getCompany(payload.teamId, payload.companyId);
    if (company === null) {
      return sair(
        "company_not_found",
        { stage: "precondition" },
        "Empresa não encontrada nesta equipa.",
      );
    }
    if (company.status !== "active") return sair("company_inactive", { stage: "precondition" });

    // --- 5. Pré-condição do adaptador (pura, antes de qualquer browser) -----
    const pre = this.deps.sessions.precondition(company);
    if (!pre.ok) return sair(pre.outcome, { stage: "precondition" });

    // --- 6. Idempotência pré-browser (só com período pedido) ----------------
    if (payload.period !== undefined && payload.force !== true) {
      const jaVisto = await this.jaResolvido(payload, payload.period);
      if (jaVisto !== null) return sair(jaVisto, { period: payload.period });
    }

    // --- 7. Cap diário ------------------------------------------------------
    // O próprio job não conta para o seu limite: a fila já lhe incrementou a
    // tentativa ao reclamá-lo.
    const hoje = await this.deps.attempts.attemptsToday(
      payload.teamId,
      payload.companyId,
      job.id,
    );
    if (hoje >= this.dailyAttemptCap) return sair("daily_cap_reached", { attempts: hoje });

    // --- 8. Credencial ------------------------------------------------------
    // Resolve-se ANTES de tocar no browser: uma credencial já marcada inválida
    // não deve fazer o worker martelar o portal a cada retentativa.
    const provider = this.deps.sessions.credentialProvider;
    const lookup = await this.deps.credentials.load(payload.credentialId);
    if (!lookup.ok) {
      if (lookup.reason === "not_found") {
        return sair(`${provider}_credential_missing`, { stage: "precondition" });
      }
      // O motivo da marca sobe ao desfecho: é o que separa "guarde uma senha
      // nova" de "espere que o bloqueio do portal caia".
      return sair(`${provider}_credential_invalid`, {
        stage: "precondition",
        ...(lookup.invalidReason === undefined ? {} : { invalidReason: lookup.invalidReason }),
      });
    }
    // A credencial tem de ser da equipa do pedido. O `credentialId` vem do
    // payload de um job e o worker corre com a service role, sem RLS a
    // segurá-lo: um id trocado abriria uma sessão no portal com a senha de
    // OUTRO gabinete e guardaria a guia no nosso. Sai antes de tocar no browser
    // e sem marcar nada — a credencial pode estar boa, o pedido é que não é
    // dela, e marcá-la partiria o gabinete a que pertence.
    if (lookup.scope.teamId !== payload.teamId) {
      return sair(
        "payload_invalid",
        { stage: "precondition" },
        "A credencial não pertence à equipa do pedido.",
      );
    }
    if (lookup.provider !== provider) {
      // O adaptador declara que credencial consome; o runner confirma. Assim o
      // runner não precisa de saber qual rota está ligada.
      return sair(
        "payload_invalid",
        { stage: "precondition" },
        "A credencial indicada não é a que este worker consome.",
      );
    }

    // --- 9. Trace ------------------------------------------------------------
    // Continuar o trace do dashboard em vez de abrir um novo: abrir aqui
    // partiria a cadeia causal (enfileirar → executar) em dois pedaços soltos.
    const trace =
      handedOff ??
      (await this.deps.tracer.startTrace({
        rootTrigger: "manual",
        triggerSource: "worker:fetch_iva_document",
        correlationKey: `company:${payload.companyId}:iva`,
      }));
    const started = await this.openStarted(trace, enqueued, job, ctx);

    let stage: IvaStage = payload.access === "toconline_direct_access" ? "toconline" : "at_login";
    let session: AuthenticatedAtSession | null = null;
    let periodId: string | null = null;

    try {
      // --- 10. Sessão -------------------------------------------------------
      const sessionEvent = await started.child({
        type: "rpa.at.session",
        source: "worker",
        payload: {
          credentialId: payload.credentialId,
          access: payload.access,
          scope: lookup.scope.companyId ? "company" : "team",
        },
      });
      // Jitter antes do login: 182 empresas em cadência exata é um padrão que
      // se vê do outro lado; espalhá-lo é a diferença entre automatizar e
      // martelar.
      await this.dormir(Math.floor(Math.random() * this.jitterMs));
      const opened = await this.deps.sessions.open({
        company,
        credentialId: payload.credentialId,
        credentials: lookup.credentials,
        scope: lookup.scope,
      });
      session = opened.session;
      await this.deps.credentials.markVerified(payload.credentialId);
      await sessionEvent.log.info("sessão estabelecida", {
        host: opened.session.host,
        reused: opened.reused,
      });
      await sessionEvent.succeed();

      // --- 11. Declaração mais recente --------------------------------------
      stage = "at_declaration";
      const declEvent = await started.child({
        type: "rpa.at.iva_declaration",
        source: "worker",
        payload: { companyId: payload.companyId },
      });
      const read = await this.deps.declarations.readMostRecent(session, company);
      if (read.kind === "none") {
        await declEvent.log.info("sem declarações de IVA", { rowsSeen: read.rowsSeen });
        // A leitura correu bem — não havia nada para ler. O desfecho do job
        // vive no `job.started`; o passo em si sucedeu.
        await declEvent.succeed();
        await started.skip("declaration_not_found");
        await trace.complete();
        return { status: "skipped", reason: "declaration_not_found", details: {} };
      }

      const lido = parsePeriod(read.period, { now: this.agora() });
      if (!lido.ok) {
        throw new AtIntegrityError(
          "at_unexpected_page",
          "O período da declaração no portal está ilegível.",
        );
      }
      const period = lido.period;
      const frequency: IvaFrequency = lido.frequency;

      const emFalta = await this.periodoEmFalta(payload, period, frequency);
      if (emFalta !== null) {
        await declEvent.succeed();
        // Não há guia para buscar, mas a obrigação existe: abre o período
        // esperado como `pending`, para o dashboard mostrar uma entrega em
        // falta e não um vazio indistinguível de "ainda nem perguntámos".
        const begunEsperado = await this.deps.ledger.beginPeriod(
          payload.teamId,
          payload.companyId,
          emFalta.expectedPeriod,
          emFalta.dueDate,
          frequency,
        );
        await this.deps.ledger.markPeriod(payload.teamId, begunEsperado.periodId, "pending");
        await started.skip("declaration_not_submitted");
        await trace.complete();
        return {
          status: "skipped",
          reason: "declaration_not_submitted",
          details: {
            // O período que FALTA, não o que o portal mostrou.
            period: emFalta.expectedPeriod,
            ...(emFalta.filingDeadline === undefined
              ? {}
              : { filingDeadline: emFalta.filingDeadline }),
          },
        };
      }

      await declEvent.log.info("declaração lida", {
        period,
        frequency,
        rowsSeen: read.rowsSeen,
        replacement: read.replacement,
      });
      await declEvent.succeed();

      // --- 12. Idempotência pós-leitura -------------------------------------
      if (payload.force !== true) {
        const jaVisto = await this.jaResolvido(payload, period);
        if (jaVisto !== null) {
          await started.skip(jaVisto);
          await trace.complete();
          return { status: "skipped", reason: jaVisto, details: { period } };
        }
      }

      // --- 13. Abrir o período ----------------------------------------------
      const prazos = derivePaymentDueDate(period);
      // Um período canónico deriva sempre: o `null` é defesa, não caminho.
      const dueDate = prazos.ok ? prazos.dueDate : null;
      const begun = await this.deps.ledger.beginPeriod(
        payload.teamId,
        payload.companyId,
        period,
        dueDate,
        frequency,
      );
      periodId = begun.periodId;

      // --- 14. Documento ----------------------------------------------------
      stage = "at_document";
      const docEvent = await started.child({
        type: "rpa.at.payment_document",
        source: "worker",
        payload: { companyId: payload.companyId, period },
      });
      const fetched = await this.deps.documents.fetch(session, { period, company });
      if (fetched.kind !== "document") {
        const semDocumento = await this.semDocumento(payload.teamId, periodId, fetched.kind);
        await docEvent.log.info("o portal não deu documento", { period, kind: fetched.kind });
        await docEvent.succeed();
        await started.skip(semDocumento);
        await trace.complete();
        return { status: "skipped", reason: semDocumento, details: { period } };
      }

      // As guardas antes de guardar: uma guia do contribuinte errado no Storage
      // do gabinete é o pior desfecho possível deste módulo.
      assertPdfIntegrity(fetched.pdf);
      assertDocumentBelongsTo(company.nif, fetched.fields.nif);
      assertPeriodMatches(period, fetched.fields.period);

      const norm = normalizeDocumentFields(fetched.fields);
      await docEvent.log.info("guia capturada", {
        via: fetched.via,
        bytes: fetched.pdf.length,
        fieldsSource: fetched.fields.source,
        warnings: norm.warnings,
      });
      await docEvent.succeed();

      // --- 15. Storage -------------------------------------------------------
      stage = "persist";
      const storeEvent = await started.child({
        type: "integration.document_stored",
        source: "worker",
        payload: { companyId: payload.companyId, period },
      });
      const stored = await this.deps.storage.put({
        teamId: payload.teamId,
        companyId: payload.companyId,
        kind: "iva",
        period,
        pdf: fetched.pdf,
      });
      await storeEvent.log.info("guia guardada", { bytes: stored.bytes });
      await storeEvent.succeed();

      // --- 16. Ledger --------------------------------------------------------
      const ledgerEvent = await started.child({
        type: "integration.obligation_recorded",
        source: "worker",
        payload: { companyId: payload.companyId, period, obligationPeriodId: periodId },
      });
      const recorded = await this.deps.ledger.recordDocument(payload.teamId, periodId, {
        type: IVA_DOCUMENT_TYPE,
        entity: norm.entity,
        reference: norm.reference,
        amount: norm.amount,
        validUntil: dueDate,
        storagePath: stored.storagePath,
        extractedAt: this.agora(),
        metadata: {
          jobId: job.id,
          via: fetched.via,
          access: payload.access,
          fieldsSource: fetched.fields.source,
          warnings: norm.warnings,
          replacement: read.replacement,
        },
      });
      await ledgerEvent.succeed();

      const hasFields = documentFieldsComplete(norm);
      const result: IvaDocumentJobResult = {
        outcome: hasFields ? "fetched" : "fetched_without_fields",
        period,
        frequency,
        dueDate: dueDate ?? "",
        obligationPeriodId: periodId,
        documentId: recorded.documentId,
        storagePath: stored.storagePath,
        hasFields,
        warnings: norm.warnings,
        access: payload.access,
      };

      await started.succeed();
      await trace.complete();
      return { status: "succeeded", result };
    } catch (err) {
      const { outcome, retry, details } = classifyFailure(err, stage);
      const periodoAberto = periodId;
      const conhecido =
        err instanceof AtAuthError ||
        err instanceof AtIntegrityError ||
        err instanceof AtTransientError ||
        err instanceof InvalidCredentialsError ||
        err instanceof StructuralError;
      // Um erro que não é nosso (ex.: `TimeoutError` do Playwright) traz no
      // próprio texto o URL que estava a navegar — e esse URL pode levar o NIF
      // na query string. O que fica em `last_error` é sempre a etiqueta PT do
      // desfecho; a classe do erro original vai só para o log, nunca a
      // mensagem.
      const message =
        conhecido && err instanceof Error ? err.message : IVA_OUTCOMES[outcome].label;
      if (!conhecido) {
        await this.safely(() =>
          started.log.warn("erro não classificado durante a captura da guia", {
            errorClass: err instanceof Error ? err.name : typeof err,
            stage,
          }),
        );
      }
      // O fingerprint é a única pista de QUE página o portal mostrou, e morria
      // dentro do erro: `last_error` guarda a etiqueta do desfecho, não o
      // objeto. Vai para um log e não para a mensagem — ele já vem redigido de
      // `classify-page.ts` (sem query string, sem dígitos), mas um log é o
      // sítio de quem investiga, não o texto que o operador lê.
      if (err instanceof AtIntegrityError && err.fingerprint) {
        const fingerprint = err.fingerprint;
        await this.safely(() => started.log.warn("página inesperada", { fingerprint }));
      }

      await markByOutcome(this.deps.credentials, outcome, details, payload);
      if (periodoAberto !== null) {
        // É o ledger que garante que `error` não regride um `delivered`/`paid`.
        await this.safely(() =>
          this.deps.ledger.markPeriod(payload.teamId, periodoAberto, "error"),
        );
      }
      if (outcome === "at_unavailable" || outcome === "toconline_unavailable") {
        await this.safely(() => this.deps.gate.trip(outcome));
      }

      // O estado do job vem sempre da tabela, nunca de um `if` local: alguns
      // desfechos lançados como exceção (`direct_access_not_configured`) são
      // `skipped` para a tabela, não `failed`.
      const desfecho = desfechoDoJob(outcome, details, message);
      if (desfecho.status === "skipped") {
        await this.safely(() => started.skip(outcome));
        await this.safely(() => trace.complete());
        return desfecho;
      }

      await this.safely(() => started.fail({ message, outcome, retry, stage }));
      // O trace fica ABERTO quando a próxima tentativa o vai continuar: fechá-lo
      // aqui partiria a cadeia da mesma obrigação em pedaços soltos, um por
      // tentativa, e o dashboard mostraria um trace falhado a meio de um
      // trabalho que ainda está a correr.
      if (!(retry && job.attempts < job.maxAttempts)) {
        await this.safely(() => trace.fail({ message }));
      }
      // `retry` vem de `classifyFailure` (a regra única, ligada à classe do
      // erro), não de `IVA_OUTCOMES[outcome].retry`: a tabela descreve o
      // desfecho em geral, a classificação sabe o que aconteceu agora.
      return { ...desfecho, retry };
    } finally {
      // A sessão fecha sempre: um contexto de browser deixado aberto vaza
      // memória e, pior, deixa cookies do contribuinte vivos.
      const aberta = session;
      if (aberta) await this.safely(() => aberta.close());
    }
  }

  /**
   * O período já está resolvido no ledger?
   *
   * `already_fetched` quando a guia lá está com ficheiro; `obligation_not_applicable`
   * quando um humano disse que o IVA não se aplica. As duas perguntas valem
   * antes e depois de abrir o browser, e é por isso que vivem num sítio só.
   */
  private async jaResolvido(
    payload: IvaDocumentJobPayload,
    period: string,
  ): Promise<"already_fetched" | "obligation_not_applicable" | null> {
    const state = await this.deps.ledger.getPeriod(payload.teamId, payload.companyId, period);
    if (state === null) return null;
    if (state.status === "delivered" && state.hasFile) return "already_fetched";
    if (state.status === "not_applicable") return "obligation_not_applicable";
    return null;
  }

  /**
   * O que falta é a declaração do período esperado, e não a nossa ida ao portal?
   *
   * Só quando o operador não pediu período nenhum: aí o alvo é o que
   * `nextDuePeriod` diz estar a vencer. Se o portal só mostra um período mais
   * antigo **e esse já está guardado**, não há nada a buscar — o que falta é o
   * contribuinte entregar a declaração. Sem a segunda metade da condição
   * confundir-se-ia "ainda não entregou" com "ainda não fomos buscar o mês
   * passado", e o operador ficaria à espera de uma entrega já feita.
   */
  private async periodoEmFalta(
    payload: IvaDocumentJobPayload,
    period: string,
    frequency: IvaFrequency,
  ): Promise<{ expectedPeriod: string; dueDate: string | null; filingDeadline?: string } | null> {
    if (payload.period !== undefined) return null;
    const esperado = nextDuePeriod(this.agora(), frequency);
    if (comparePeriods(period, esperado) >= 0) return null;

    const state = await this.deps.ledger.getPeriod(payload.teamId, payload.companyId, period);
    if (state === null || state.status !== "delivered" || !state.hasFile) return null;

    const prazos = derivePaymentDueDate(esperado);
    return {
      expectedPeriod: esperado,
      dueDate: prazos.ok ? prazos.dueDate : null,
      ...(prazos.ok ? { filingDeadline: prazos.filingDeadline } : {}),
    };
  }

  /** "Sem documento" não é exceção — é um estado do período a registar. */
  private async semDocumento(
    teamId: string,
    periodId: string,
    kind: "no_document" | "already_paid" | "not_ready",
  ): Promise<"no_payment_document" | "already_paid" | "document_not_ready"> {
    if (kind === "no_document") {
      await this.deps.ledger.markPeriod(teamId, periodId, "skipped_nonexistent");
      return "no_payment_document";
    }
    if (kind === "already_paid") {
      await this.deps.ledger.markPeriod(teamId, periodId, "paid");
      return "already_paid";
    }
    await this.deps.ledger.markPeriod(teamId, periodId, "pending");
    return "document_not_ready";
  }

  /**
   * Abre o `job.started` — sempre pendurado no evento de enfileiramento quando
   * ele existe, para a cadeia enfileirar → executar ficar de uma peça só.
   */
  private openStarted(
    trace: TraceHandle,
    enqueued: EventHandle | null,
    job: ClaimedJob,
    ctx: ContextoDoJob,
  ): Promise<EventHandle> {
    const input: EventInput = {
      type: "job.started",
      source: "worker",
      payload: {
        jobId: job.id,
        teamId: ctx.teamId,
        companyId: ctx.companyId,
        attempt: job.attempts,
        access: ctx.access,
        ...(ctx.batchId === undefined ? {} : { batchId: ctx.batchId }),
      },
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
    ctx: ContextoDoJob,
    outcome: IvaOutcome,
    message: string,
  ): Promise<void> {
    // Sem trace na fila não há nada a fechar — e inventar um aqui só criaria um
    // trace órfão sem a empresa que o correlaciona.
    if (!trace) return;

    await this.safely(async () => {
      const started = await this.openStarted(trace, enqueued, job, ctx);
      if (IVA_OUTCOMES[outcome].jobStatus === "failed") {
        await started.fail({ message, outcome });
        await trace.fail({ message });
        return;
      }
      // Ignorado de propósito não é falhar: o trabalho terminou e o trace fecha
      // concluído. O passo desta passagem fica legível na mesma.
      await started.skip(outcome);
      // Um ADIAMENTO é a exceção: o job volta à fila sem gastar tentativa e a
      // mesma execução continua daqui a 15 min, neste mesmo trace. Fechá-lo
      // aqui dava ao dashboard um trabalho "concluído" que ainda não fez nada,
      // e a passagem seguinte penduraria os seus eventos num trace encerrado.
      if (outcome === "portal_paused") return;
      await trace.complete();
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
