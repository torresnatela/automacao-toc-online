import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, createTracer } from "@toc/core";
import {
  IVA_DOCUMENT_JOB_TYPE,
  IVA_DOCUMENT_TYPE,
  IVA_OUTCOMES,
  IVA_RESULT_KEYS,
  derivePaymentDueDate,
  type IvaDocumentJobPayload,
  type IvaDocumentJobResult,
} from "@toc/core/domain";
import { IvaDocumentRunner } from "../../src/runner/iva-document-runner";
import type { ClaimedJob } from "../../src/runner/job-queue";
import type { DeclarationRead, RawPortalDocumentFields } from "../../src/runner/ports";
import {
  AtAuthError,
  AtIntegrityError,
  AtTransientError,
  InvalidCredentialsError,
  StructuralError,
} from "../../src/errors";
import {
  CREDENCIAL_TOCONLINE,
  CREDENTIAL,
  COMPANY,
  ENTIDADE,
  FakeAttempts,
  FakeCredentials,
  FakeDeclarations,
  FakeDocuments,
  FakeGate,
  FakeLedger,
  FakeSessions,
  FakeStorage,
  NIF,
  NOME_EMPRESA,
  REFERENCIA,
  SENHA,
  TEAM,
  VALOR,
  documento,
  empresa,
  pdfValido,
} from "./iva-fakes";

/**
 * O mapa de casos da spec §5, uma linha de cada vez.
 *
 * Tudo o que toca no mundo entra por uma porta injetada — não há browser, rede
 * nem base de dados aqui. O que se prova é a **decisão**: que desfecho sai, que
 * credencial foi marcada, que estado ficou no período, que eventos foram
 * escritos e o que **não** foi escrito (o selo RGPD, no fim).
 */

/** Relógio fixo: `nextDuePeriod(2026-09-04, "monthly")` === `"2026-07"`. */
const AGORA = new Date("2026-09-04T10:00:00Z");
const PERIODO = "2026-07";
const PERIODO_ANTERIOR = "2026-06";

let store: InMemoryStore;

beforeEach(() => {
  store = new InMemoryStore();
});

function payload(over: Partial<IvaDocumentJobPayload> = {}): IvaDocumentJobPayload {
  return {
    teamId: TEAM,
    companyId: COMPANY,
    access: "at_direct_login",
    credentialId: CREDENTIAL,
    credentialScope: "team",
    ...over,
  };
}

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    type: IVA_DOCUMENT_JOB_TYPE,
    companyId: COMPANY,
    payload: payload(),
    attempts: 1,
    maxAttempts: 3,
    traceId: null,
    triggeringEventId: null,
    ...over,
  };
}

interface BuildOptions {
  credentials?: FakeCredentials;
  sessions?: FakeSessions;
  declarations?: FakeDeclarations;
  documents?: FakeDocuments;
  storage?: FakeStorage;
  ledger?: FakeLedger;
  attempts?: FakeAttempts;
  gate?: FakeGate;
  policy?: { dailyAttemptCap?: number; pacingMs?: number; jitterMs?: number };
}

function build(opts: BuildOptions = {}) {
  const credentials = opts.credentials ?? new FakeCredentials();
  const sessions = opts.sessions ?? new FakeSessions();
  const declarations = opts.declarations ?? new FakeDeclarations();
  const documents = opts.documents ?? new FakeDocuments();
  const storage = opts.storage ?? new FakeStorage();
  const ledger = opts.ledger ?? new FakeLedger();
  const attempts = opts.attempts ?? new FakeAttempts();
  const gate = opts.gate ?? new FakeGate();
  /** Ninguém espera de verdade — mas o que se ia esperar fica registado. */
  const sleeps: number[] = [];

  const runner = new IvaDocumentRunner({
    tracer: createTracer(store),
    store,
    credentials,
    sessions,
    declarations,
    documents,
    storage,
    ledger,
    attempts,
    gate,
    ...(opts.policy ? { policy: opts.policy } : {}),
    clock: () => AGORA,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  });

  return {
    runner,
    credentials,
    sessions,
    declarations,
    documents,
    storage,
    ledger,
    attempts,
    gate,
    sleeps,
  };
}

/** Período já entregue e com ficheiro — a linha que dispara `already_fetched`. */
function periodoEntregue(period: string) {
  return {
    [period]: {
      periodId: `period-${period}`,
      status: "delivered" as const,
      documentId: "d",
      hasFile: true,
    },
  };
}

const tiposDosEventos = () =>
  [...store.events.values()].map((e) => e.type).filter((t) => t !== "job.started");
const eventoJobStarted = () => [...store.events.values()].find((e) => e.type === "job.started");
const estadoDoTrace = () => [...store.traces.values()][0]?.status;

describe("IvaDocumentRunner", () => {
  describe("§5.1 sucesso e estados válidos", () => {
    it("`fetched`: PDF e campos lidos → guarda, regista e devolve o resultado", async () => {
      const { runner, ledger, storage } = build();

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect(outcome.result).toMatchObject({
        outcome: "fetched",
        period: PERIODO,
        frequency: "monthly",
        dueDate: "2026-09-25",
        obligationPeriodId: `period-${PERIODO}`,
        documentId: "doc-1",
        hasFields: true,
        warnings: [],
        access: "at_direct_login",
      });
      expect(storage.puts).toEqual([{ period: PERIODO, bytes: pdfValido().length }]);
      expect(ledger.begun).toEqual([
        { period: PERIODO, dueDate: "2026-09-25", frequency: "monthly" },
      ]);
      expect(ledger.recorded).toHaveLength(1);
      expect(ledger.recorded[0]?.doc).toMatchObject({
        type: IVA_DOCUMENT_TYPE,
        entity: ENTIDADE,
        reference: REFERENCIA,
        // Normalizado para `numeric`: ponto decimal, duas casas.
        amount: "1234.56",
        validUntil: "2026-09-25",
      });
    });

    it("`fetched_without_fields`: PDF bom, campos ilegíveis", async () => {
      const documents = new FakeDocuments(
        documento({ entity: null, reference: "abc", amount: null }),
      );
      const { runner, ledger } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect(outcome.result).toMatchObject({
        outcome: "fetched_without_fields",
        hasFields: false,
        warnings: ["entidade_ausente", "referencia_invalida", "valor_ausente"],
      });
      // O PDF vale por si: guarda-se na mesma, com os campos a null.
      expect(ledger.recorded[0]?.doc).toMatchObject({
        entity: null,
        reference: null,
        amount: null,
      });
    });

    it("`already_fetched` (pré-browser): período pedido já entregue com ficheiro", async () => {
      const ledger = new FakeLedger({ periods: periodoEntregue(PERIODO) });
      const { runner, sessions } = build({ ledger });

      const outcome = await runner.run(job({ payload: payload({ period: PERIODO }) }));

      expect(outcome).toEqual({
        status: "skipped",
        reason: "already_fetched",
        details: { period: PERIODO },
      });
      // Sabia-se antes de tentar: nem se abre o browser.
      expect(sessions.opened).toBe(0);
    });

    it("`already_fetched` (pós-leitura): o portal revelou um período já guardado", async () => {
      const ledger = new FakeLedger({ periods: periodoEntregue(PERIODO) });
      const { runner, sessions, documents, storage } = build({ ledger });

      // Sem `period` no payload: só depois de ler a declaração se sabe qual é.
      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "skipped",
        reason: "already_fetched",
        details: { period: PERIODO },
      });
      expect(sessions.opened).toBe(1);
      expect(documents.calls).toBe(0);
      expect(storage.puts).toHaveLength(0);
    });

    it("`already_fetched` cede ao `force` — é o «Buscar novamente» da interface", async () => {
      const ledger = new FakeLedger({ periods: periodoEntregue(PERIODO) });
      const { runner } = build({ ledger });

      const outcome = await runner.run(job({ payload: payload({ period: PERIODO, force: true }) }));

      expect(outcome.status).toBe("succeeded");
    });

    it("`no_payment_document`: período `skipped_nonexistent` e nada guardado", async () => {
      const documents = new FakeDocuments({ kind: "no_document" });
      const { runner, ledger, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "skipped",
        reason: "no_payment_document",
        details: { period: PERIODO },
      });
      expect(ledger.marked).toEqual([
        { periodId: `period-${PERIODO}`, status: "skipped_nonexistent" },
      ]);
      expect(storage.puts).toHaveLength(0);
      expect(ledger.recorded).toHaveLength(0);
    });

    it("`already_paid`: período `paid`", async () => {
      const documents = new FakeDocuments({ kind: "already_paid" });
      const { runner, ledger, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "skipped",
        reason: "already_paid",
        details: { period: PERIODO },
      });
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "paid" }]);
      expect(storage.puts).toHaveLength(0);
    });

    it("`document_not_ready`: período `pending`", async () => {
      const documents = new FakeDocuments({ kind: "not_ready" });
      const { runner, ledger, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "skipped",
        reason: "document_not_ready",
        details: { period: PERIODO },
      });
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "pending" }]);
      expect(storage.puts).toHaveLength(0);
    });

    it("`declaration_not_submitted`: o portal só tem o período anterior, já guardado", async () => {
      const declarations = new FakeDeclarations({
        kind: "found",
        period: PERIODO_ANTERIOR,
        submittedAt: "2026-08-01",
        replacement: false,
        rowsSeen: 4,
      });
      const ledger = new FakeLedger({ periods: periodoEntregue(PERIODO_ANTERIOR) });
      const { runner, documents } = build({ declarations, ledger });

      const outcome = await runner.run(job());

      const prazos = derivePaymentDueDate(PERIODO);
      expect(outcome).toEqual({
        status: "skipped",
        reason: "declaration_not_submitted",
        details: {
          // O período que FALTA, não o que o portal mostrou.
          period: PERIODO,
          filingDeadline: prazos.ok ? prazos.filingDeadline : "",
        },
      });
      expect(documents.calls).toBe(0);
      // A obrigação em falta fica registada — não é um vazio, é um `pending`.
      expect(ledger.begun).toEqual([
        { period: PERIODO, dueDate: prazos.ok ? prazos.dueDate : null, frequency: "monthly" },
      ]);
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "pending" }]);
    });

    it("período anterior por guardar não é `declaration_not_submitted` — vai buscá-lo", async () => {
      const declarations = new FakeDeclarations({
        kind: "found",
        period: PERIODO_ANTERIOR,
        submittedAt: "2026-08-01",
        replacement: false,
        rowsSeen: 4,
      });
      // A guia que o portal dá é a do período que ele mostra — e a guarda de
      // período confirma-o antes de guardar seja o que for.
      const documents = new FakeDocuments(documento({ period: PERIODO_ANTERIOR }));
      const { runner } = build({ declarations, documents });

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect((outcome.result as IvaDocumentJobResult).period).toBe(PERIODO_ANTERIOR);
    });

    it("`declaration_not_found`: o portal não mostra declarações de IVA", async () => {
      const declarations = new FakeDeclarations({ kind: "none", rowsSeen: 0 });
      const { runner, documents, ledger } = build({ declarations });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({ status: "skipped", reason: "declaration_not_found", details: {} });
      expect(documents.calls).toBe(0);
      // Sem período conhecido não há linha de período a abrir.
      expect(ledger.begun).toHaveLength(0);
    });
  });

  describe("§5.2 pré-condição (antes de qualquer browser)", () => {
    it("`payload_invalid`: payload incompleto", async () => {
      const { runner, sessions } = build();

      const outcome = await runner.run(job({ payload: { teamId: TEAM } }));

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "payload_invalid" });
      expect(sessions.opened).toBe(0);
    });

    it("`payload_invalid`: modo de acesso que este worker não serve", async () => {
      // O worker está montado na rota B; o pedido veio para a rota A.
      const { runner, sessions } = build();

      const outcome = await runner.run(
        job({ payload: payload({ access: "toconline_direct_access" }) }),
      );

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "payload_invalid" });
      expect(sessions.openInputs).toHaveLength(0);
    });

    it("`payload_invalid`: a credencial não é a que o adaptador consome", async () => {
      // Adaptador da rota B (consome `at`) com uma credencial `toconline`.
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner, sessions } = build({ credentials });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "payload_invalid" });
      expect(sessions.opened).toBe(0);
    });

    it("`payload_invalid`: a credencial é de outra equipa", async () => {
      // O `credentialId` vem do payload de um job, e o worker corre com a
      // service role — sem RLS a segurá-lo. Um id trocado abriria uma sessão no
      // portal com a senha de OUTRO gabinete e guardava a guia no nosso.
      const credentials = new FakeCredentials({
        ok: true,
        credentials: { username: "gabinete@outra.pt", password: SENHA },
        provider: "at",
        scope: { teamId: "99999999-9999-9999-9999-999999999999", companyId: null },
      });
      const { runner, sessions } = build({ credentials });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "payload_invalid" });
      expect(outcome).toMatchObject({ message: "A credencial não pertence à equipa do pedido." });
      expect(sessions.opened).toBe(0);
      // Nem marcar: a credencial pode estar perfeitamente boa — o pedido é que
      // não é dela, e marcá-la partia o gabinete a que pertence.
      expect(credentials.todasAsMarcas).toHaveLength(0);
    });

    it("`company_not_found`: falha sem retry", async () => {
      const ledger = new FakeLedger({ company: null });
      const { runner, sessions } = build({ ledger });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "company_not_found" });
      expect(sessions.opened).toBe(0);
    });

    it("`company_inactive`: ignorado", async () => {
      const ledger = new FakeLedger({ company: empresa({ status: "inactive" }) });
      const { runner, sessions } = build({ ledger });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "skipped", reason: "company_inactive" });
      expect(sessions.opened).toBe(0);
    });

    it("`obligation_not_applicable`: o humano marcou o período como não aplicável", async () => {
      const ledger = new FakeLedger({
        periods: {
          [PERIODO]: {
            periodId: "p1",
            status: "not_applicable",
            documentId: null,
            hasFile: false,
          },
        },
      });
      const { runner, sessions } = build({ ledger });

      const outcome = await runner.run(job({ payload: payload({ period: PERIODO }) }));

      expect(outcome).toEqual({
        status: "skipped",
        reason: "obligation_not_applicable",
        details: { period: PERIODO },
      });
      expect(sessions.opened).toBe(0);
    });

    it("`company_not_linked`: a pré-condição do adaptador recusa antes do browser", async () => {
      const sessions = new FakeSessions({
        precondition: { ok: false, outcome: "company_not_linked" },
      });
      const { runner } = build({ sessions });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "skipped", reason: "company_not_linked" });
      expect(sessions.opened).toBe(0);
    });

    it("`company_nif_missing`: falta de NIF não gasta uma sessão", async () => {
      const sessions = new FakeSessions({
        precondition: { ok: false, outcome: "company_nif_missing" },
      });
      const { runner } = build({ sessions });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "skipped", reason: "company_nif_missing" });
      expect(sessions.opened).toBe(0);
    });

    it("`at_credential_missing`: sem credencial da AT", async () => {
      const credentials = new FakeCredentials({ ok: false, reason: "not_found" });
      const { runner, sessions } = build({ credentials });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "skipped", reason: "at_credential_missing" });
      expect(sessions.opened).toBe(0);
    });

    it("`at_credential_invalid`: credencial já marcada inválida não volta ao portal", async () => {
      const credentials = new FakeCredentials({ ok: false, reason: "invalid" });
      const { runner, sessions } = build({ credentials });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "skipped", reason: "at_credential_invalid" });
      expect(sessions.opened).toBe(0);
      // Já está marcada: não se remarca.
      expect(credentials.todasAsMarcas).toHaveLength(0);
    });

    it("`at_credential_invalid`: a orientação diz o motivo que a fonte guardou", async () => {
      const credentials = new FakeCredentials({
        ok: false,
        reason: "invalid",
        invalidReason: "senha_bloqueada",
      });
      const { runner } = build({ credentials });

      const outcome = await runner.run(job());

      // Sem o motivo, o operador lê "credencial inválida" e não sabe se guarda
      // uma senha nova ou se espera que o bloqueio do portal caia.
      expect(outcome).toMatchObject({
        status: "skipped",
        reason: "at_credential_invalid",
        details: { invalidReason: "senha_bloqueada" },
      });
    });

    it("`toconline_credential_missing` na rota A", async () => {
      const sessions = new FakeSessions({ access: "toconline_direct_access" });
      const credentials = new FakeCredentials({ ok: false, reason: "not_found" });
      const { runner } = build({ sessions, credentials });

      const outcome = await runner.run(
        job({ payload: payload({ access: "toconline_direct_access" }) }),
      );

      expect(outcome).toMatchObject({ status: "skipped", reason: "toconline_credential_missing" });
    });

    it("`toconline_credential_invalid` na rota A (credencial expirada conta como inválida)", async () => {
      const sessions = new FakeSessions({ access: "toconline_direct_access" });
      const credentials = new FakeCredentials({ ok: false, reason: "expired" });
      const { runner } = build({ sessions, credentials });

      const outcome = await runner.run(
        job({ payload: payload({ access: "toconline_direct_access" }) }),
      );

      expect(outcome).toMatchObject({ status: "skipped", reason: "toconline_credential_invalid" });
    });

    it("`daily_cap_reached`: o contador do dia vai no `details.attempts`", async () => {
      const attempts = new FakeAttempts(5);
      const { runner, sessions } = build({ attempts });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "skipped",
        reason: "daily_cap_reached",
        details: { attempts: 5 },
      });
      expect(sessions.opened).toBe(0);
      // O próprio job não conta para o seu limite.
      expect(attempts.calls).toEqual([{ companyId: COMPANY, excludeJobId: "job-1" }]);
    });

    it("`portal_paused`: adiado sem abrir sessão e sem gastar tentativa", async () => {
      const gate = new FakeGate(1_800_000);
      const { runner, sessions, ledger } = build({ gate });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({
        status: "deferred",
        reason: "portal_paused",
        untilMs: 1_800_000,
      });
      expect(sessions.opened).toBe(0);
      // A trava vem antes de tudo: nem sequer se pergunta pela empresa.
      expect(ledger.periodsAsked).toHaveLength(0);
    });
  });

  describe("§5.3 sessão TOConline e Acesso Direto (rota A)", () => {
    const jobRotaA = () => job({ payload: payload({ access: "toconline_direct_access" }) });
    const rotaA = (failure: Error) =>
      new FakeSessions({ access: "toconline_direct_access", failure });

    it("`toconline_login_rejected` marca a credencial do TOConline — foi a submetida", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner } = build({
        sessions: rotaA(new InvalidCredentialsError()),
        credentials,
      });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "toconline_login_rejected",
      });
      expect(credentials.invalidated).toEqual([{ id: CREDENTIAL, reason: "login_rejeitado" }]);
      // A senha da AT da empresa não foi acusada de nada.
      expect(credentials.companyMarkers).toHaveLength(0);
    });

    it("`toconline_unavailable` é retentável, não marca credencial nenhuma e dispara a trava do portal", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const gate = new FakeGate();
      const { runner } = build({ sessions: rotaA(new Error("ECONNRESET")), credentials, gate });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: true,
        code: "toconline_unavailable",
      });
      expect(credentials.todasAsMarcas).toHaveLength(0);
      // Mesma trava do `at_unavailable`: o TOConline também é um portal de
      // terceiro, e 182 jobs não podem martelá-lo em fila.
      expect(gate.tripped).toEqual(["toconline_unavailable"]);
    });

    it("`toconline_unexpected_page`: página irreconhecível não se retenta", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner } = build({
        sessions: rotaA(new StructuralError("grid do TOConline desapareceu")),
        credentials,
      });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "toconline_unexpected_page",
      });
    });

    it("`direct_access_extension_missing`: intervenção técnica, sem retry", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner } = build({
        sessions: rotaA(
          new AtIntegrityError("direct_access_extension_missing", "extensão ausente no perfil"),
        ),
        credentials,
      });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "direct_access_extension_missing",
      });
      expect(credentials.todasAsMarcas).toHaveLength(0);
    });

    it("`direct_access_failed`: retentável", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner } = build({
        sessions: rotaA(new AtTransientError("direct_access_failed", "o popup não abriu")),
        credentials,
      });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: true,
        code: "direct_access_failed",
      });
    });

    it("`direct_access_not_configured`: a tabela diz `skipped`, não `failed` — e marca a empresa", async () => {
      // A tabela (`IVA_OUTCOMES`) manda no `status`, não a origem (exceção) do
      // desfecho: este código nasce de um `throw`, mas é `skipped` na tabela.
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const { runner } = build({
        sessions: rotaA(
          new AtIntegrityError(
            "direct_access_not_configured",
            "A senha da AT da empresa não está configurada.",
          ),
        ),
        credentials,
      });

      const outcome = await runner.run(jobRotaA());

      expect(outcome).toMatchObject({
        status: "skipped",
        reason: "direct_access_not_configured",
      });
      // Rota A: a senha da AT vive no TOConline — o marcador é da empresa, a
      // credencial do TOConline (a que abriu a sessão) fica intacta.
      expect(credentials.companyMarkers).toEqual([
        { teamId: TEAM, companyId: COMPANY, reason: "senha_nao_configurada" },
      ]);
      expect(credentials.invalidated).toHaveLength(0);
      expect(credentials.expired).toHaveLength(0);
      expect(estadoDoTrace()).toBe("completed");
    });
  });

  describe("§5.4 autenticação na AT", () => {
    const comFalhaNaSessao = (failure: Error) => new FakeSessions({ failure });

    it("`at_login_rejected`: marca exatamente a credencial submetida, com `attemptsLeft`", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({
        sessions: comFalhaNaSessao(new AtAuthError("rejected", 2)),
        credentials,
      });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_login_rejected",
        details: { stage: "at_login", attemptsLeft: 2 },
      });
      expect(credentials.invalidated).toEqual([{ id: CREDENTIAL, reason: "login_rejeitado" }]);
      expect(credentials.expired).toHaveLength(0);
    });

    it("`at_password_blocked`: credencial inválida com `senha_bloqueada`", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({
        sessions: comFalhaNaSessao(new AtAuthError("blocked")),
        credentials,
      });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_password_blocked",
      });
      expect(credentials.invalidated).toEqual([{ id: CREDENTIAL, reason: "senha_bloqueada" }]);
    });

    it("`at_password_expired`: `markExpired`, não `markInvalid`", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({
        sessions: comFalhaNaSessao(new AtAuthError("expired")),
        credentials,
      });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_password_expired",
      });
      expect(credentials.expired).toEqual([{ id: CREDENTIAL, reason: "senha_expirada" }]);
      expect(credentials.invalidated).toHaveLength(0);
    });

    it("`at_2fa_required` na rota A escreve o marcador da empresa e NÃO toca na credencial TOConline", async () => {
      const credentials = new FakeCredentials(CREDENCIAL_TOCONLINE);
      const sessions = new FakeSessions({
        access: "toconline_direct_access",
        failure: new AtAuthError("two_factor", 3),
      });
      const { runner } = build({ sessions, credentials });

      const outcome = await runner.run(
        job({ payload: payload({ access: "toconline_direct_access" }) }),
      );

      expect(outcome).toMatchObject({ status: "failed", retry: false, code: "at_2fa_required" });
      // O portal falou da senha da AT da empresa, não da nossa do TOConline.
      expect(credentials.companyMarkers).toEqual([
        { teamId: TEAM, companyId: COMPANY, reason: "2fa_exigido", attemptsLeft: 3 },
      ]);
      expect(credentials.invalidated).toHaveLength(0);
      expect(credentials.expired).toHaveLength(0);
    });

    it("`at_2fa_required` na rota B expira a nossa credencial da AT", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({
        sessions: comFalhaNaSessao(new AtAuthError("two_factor")),
        credentials,
      });

      await runner.run(job());

      expect(credentials.expired).toEqual([{ id: CREDENTIAL, reason: "2fa_exigido" }]);
      expect(credentials.companyMarkers).toHaveLength(0);
    });

    it("`at_authorization_missing`: a senha está certa — não se marca nada", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({
        sessions: comFalhaNaSessao(new AtAuthError("authorization_missing")),
        credentials,
      });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_authorization_missing",
      });
      expect(credentials.todasAsMarcas).toHaveLength(0);
    });

    it("`at_session_mismatch`: sessão de outro contribuinte, nada guardado", async () => {
      const declarations = new FakeDeclarations(
        new AtIntegrityError("at_session_mismatch", "o NIF da sessão não é o da empresa"),
      );
      const { runner, storage, ledger } = build({ declarations });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_session_mismatch",
      });
      expect(storage.puts).toHaveLength(0);
      expect(ledger.recorded).toHaveLength(0);
    });

    it("`at_unexpected_page`: estrutural na leitura da declaração", async () => {
      const declarations = new FakeDeclarations(new StructuralError("tabela irreconhecível"));
      const { runner } = build({ declarations });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_unexpected_page",
        details: { stage: "at_declaration" },
      });
    });

    it("período ilegível no portal é `at_unexpected_page`, não um período inventado", async () => {
      const declarations = new FakeDeclarations({
        kind: "found",
        period: "sem forma conhecida",
        submittedAt: null,
        replacement: false,
        rowsSeen: 1,
      });
      const { runner, ledger } = build({ declarations });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "at_unexpected_page",
      });
      expect(ledger.begun).toHaveLength(0);
    });

    it("o fingerprint da página inesperada fica registado num log", async () => {
      // Sem isto o fingerprint — a única pista de que página o portal mostrou —
      // morria dentro do erro, e quem investiga ficava com "página inesperada"
      // e mais nada. Ele já vem redigido de `classify-page.ts`.
      const declarations = new FakeDeclarations(
        new AtIntegrityError("at_unexpected_page", "página inesperada", {
          host: "sitfiscal.portaldasfinancas.pt",
          headings: ["#"],
        }),
      );
      const { runner } = build({ declarations });

      await runner.run(job());

      const registado = [...store.logs.values()].find((log) => log.data.fingerprint !== undefined);
      expect(registado).toMatchObject({
        level: "warn",
        data: { fingerprint: { host: "sitfiscal.portaldasfinancas.pt", headings: ["#"] } },
      });
      // O fingerprint já vem redigido de `classify-page.ts` — o selo continua verde.
      expect(JSON.stringify([...store.logs.values()])).not.toContain(NIF);
    });

    it("`at_unavailable` é retentável e dispara a trava do portal", async () => {
      const declarations = new FakeDeclarations(new Error("Timeout 30000ms exceeded"));
      const gate = new FakeGate();
      const { runner } = build({ declarations, gate });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: true, code: "at_unavailable" });
      // Um portal em baixo não pode fazer 182 jobs queimarem tentativa em fila.
      expect(gate.tripped).toEqual(["at_unavailable"]);
    });
  });

  describe("§5.5 captura do documento", () => {
    it("`document_capture_failed`: o que veio não começa por `%PDF-`", async () => {
      // A AT devolveu a página de manutenção em vez do ficheiro.
      const documents = new FakeDocuments({
        ...(documento() as { kind: "document"; fields: RawPortalDocumentFields; via: "download" }),
        pdf: Buffer.from("<html><body>Manutenção</body></html>".padEnd(2000, " ")),
      });
      const { runner, ledger, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: true,
        code: "document_capture_failed",
      });
      expect(storage.puts).toHaveLength(0);
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "error" }]);
    });

    it("`document_capture_failed`: PDF truncado (menos de 1 KB)", async () => {
      const documents = new FakeDocuments({
        ...(documento() as { kind: "document"; fields: RawPortalDocumentFields; via: "download" }),
        pdf: Buffer.from("%PDF-1.7\ncortado a meio"),
      });
      const { runner, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: true,
        code: "document_capture_failed",
      });
      expect(storage.puts).toHaveLength(0);
    });

    it("`document_fields_mismatch` por NIF: a guia é de outra empresa", async () => {
      const documents = new FakeDocuments(documento({ nif: "502011378" }));
      const { runner, storage, ledger } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "document_fields_mismatch",
      });
      expect(storage.puts).toHaveLength(0);
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "error" }]);
    });

    it("`document_fields_mismatch` por período: a guia é de outro período", async () => {
      const documents = new FakeDocuments(documento({ period: "2026-05" }));
      const { runner, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "document_fields_mismatch",
      });
      expect(storage.puts).toHaveLength(0);
    });

    it("`document_type_unexpected`: veio outra coisa que não a guia", async () => {
      const documents = new FakeDocuments(
        new AtIntegrityError("document_type_unexpected", "não é a guia da declaração"),
      );
      const { runner, storage } = build({ documents });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "document_type_unexpected",
      });
      expect(storage.puts).toHaveLength(0);
    });
  });

  describe("§5.6 persistência e infraestrutura", () => {
    it("`persist_failed`: o Storage não respondeu → período `error`, sem registo", async () => {
      const storage = new FakeStorage(new AtTransientError("persist_failed", "Storage 503"));
      const { runner, ledger } = build({ storage });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: true,
        code: "persist_failed",
        details: { stage: "persist" },
      });
      expect(ledger.recorded).toHaveLength(0);
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "error" }]);
    });

    it("`persist_rejected`: a escrita foi recusada — repetir não a faz passar", async () => {
      const storage = new FakeStorage(new StructuralError("bucket inexistente"));
      const { runner, ledger } = build({ storage });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({
        status: "failed",
        retry: false,
        code: "persist_rejected",
      });
      expect(ledger.recorded).toHaveLength(0);
    });

    it("ledger a falhar depois do upload → falha retentável (o upload é idempotente)", async () => {
      const ledger = new FakeLedger({
        recordFailure: new AtTransientError("persist_failed", "a base de dados não respondeu"),
      });
      const { runner, storage } = build({ ledger });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: true, code: "persist_failed" });
      expect(storage.puts).toHaveLength(1);
      expect(ledger.marked).toEqual([{ periodId: `period-${PERIODO}`, status: "error" }]);
    });

    it("`unknown_error`: alguém lançou algo que não é `Error`", async () => {
      class DeclaracoesQueLancamLixo extends FakeDeclarations {
        override async readMostRecent(): Promise<DeclarationRead> {
          throw "o adaptador lançou uma string";
        }
      }
      const { runner } = build({ declarations: new DeclaracoesQueLancamLixo() });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: true, code: "unknown_error" });
    });
  });

  describe("contrato de jobs.result", () => {
    it("usa exatamente as chaves que o dashboard lê", async () => {
      const { runner } = build();

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect(Object.keys(outcome.result as object).sort()).toEqual([...IVA_RESULT_KEYS].sort());
    });

    it("o estado do job de cada desfecho é o que `IVA_OUTCOMES` promete", async () => {
      // `jobs.result`/`last_error` é jsonb: se o runner gravar `failed` num
      // desfecho que a tabela diz ser `skipped`, o dashboard procura o código no
      // sítio errado e mostra "erro inesperado" a quem só precisava de esperar.
      const casos = [
        {
          esperado: "at_credential_missing",
          opts: { credentials: new FakeCredentials({ ok: false, reason: "not_found" as const }) },
        },
        {
          esperado: "company_inactive",
          opts: { ledger: new FakeLedger({ company: empresa({ status: "inactive" }) }) },
        },
        { esperado: "daily_cap_reached", opts: { attempts: new FakeAttempts(5) } },
      ];

      for (const caso of casos) {
        store = new InMemoryStore();
        const { runner } = build(caso.opts);
        const outcome = await runner.run(job());
        expect(outcome.status).toBe(
          IVA_OUTCOMES[caso.esperado as keyof typeof IVA_OUTCOMES].jobStatus,
        );
      }
    });
  });

  describe("observabilidade", () => {
    it("a cadeia de eventos do caminho feliz é a da spec", async () => {
      const { runner } = build();

      await runner.run(job());

      expect(tiposDosEventos()).toEqual([
        "rpa.at.session",
        "rpa.at.iva_declaration",
        "rpa.at.payment_document",
        "integration.document_stored",
        "integration.obligation_recorded",
      ]);
      expect(eventoJobStarted()?.status).toBe("succeeded");
      expect(estadoDoTrace()).toBe("completed");
    });

    it("o `job.started` leva o contexto do job, sem dados da empresa", async () => {
      const { runner } = build();

      await runner.run(job({ payload: payload({ batchId: "lote-1" }), attempts: 2 }));

      expect(eventoJobStarted()?.payload).toEqual({
        jobId: "job-1",
        teamId: TEAM,
        companyId: COMPANY,
        attempt: 2,
        access: "at_direct_login",
        batchId: "lote-1",
      });
    });

    /**
     * O dashboard abre o trace e entrega-o (`handOff`) — quem o fecha é o
     * worker. Uma saída antecipada que o ignore deixa-o aberto para sempre,
     * indistinguível de um job enfileirado e nunca consumido.
     */
    describe("saídas antecipadas fecham o trace do dashboard", () => {
      async function traceDoDashboard() {
        const trace = await createTracer(store).startTrace({
          rootTrigger: "manual",
          triggerSource: "documents.iva.fetch",
        });
        const enqueued = await trace.event({ type: "job.enqueued", source: "web" });
        await enqueued.succeed();
        return { traceId: trace.id, triggeringEventId: enqueued.id };
      }

      it("payload inválido não deixa o trace aberto", async () => {
        const ligacao = await traceDoDashboard();
        const { runner } = build();

        await runner.run(job({ ...ligacao, payload: { teamId: TEAM } }));

        expect(estadoDoTrace()).toBe("failed");
        expect(eventoJobStarted()?.status).toBe("failed");
      });

      it("empresa inexistente não deixa o trace aberto", async () => {
        const ligacao = await traceDoDashboard();
        const { runner } = build({ ledger: new FakeLedger({ company: null }) });

        await runner.run(job(ligacao));

        expect(estadoDoTrace()).toBe("failed");
        expect(eventoJobStarted()?.status).toBe("failed");
      });

      it("credencial inválida encerra o trace concluído e marca o evento `skipped`", async () => {
        const ligacao = await traceDoDashboard();
        const credentials = new FakeCredentials({ ok: false, reason: "invalid" });
        const { runner } = build({ credentials });

        await runner.run(job(ligacao));

        // Ignorar de propósito não é falhar: o trabalho terminou.
        expect(estadoDoTrace()).toBe("completed");
        expect(eventoJobStarted()?.status).toBe("skipped");
        // O enfileiramento SUCEDEU: reescrevê-lo seria mentir sobre o dashboard.
        expect(store.events.get(ligacao.triggeringEventId)?.status).toBe("succeeded");
      });

      it("limite diário encerra o trace concluído", async () => {
        const ligacao = await traceDoDashboard();
        const { runner } = build({ attempts: new FakeAttempts(5) });

        await runner.run(job(ligacao));

        expect(estadoDoTrace()).toBe("completed");
        expect(eventoJobStarted()?.status).toBe("skipped");
      });

      it("portal em pausa deixa o trace ABERTO — a mesma execução continua daqui a 15 min", async () => {
        // Adiar não é terminar: o job volta à fila sem gastar tentativa e a
        // próxima passagem continua ESTE trace. Fechá-lo aqui dava ao dashboard
        // um trabalho "concluído" que ainda não fez nada, e a passagem seguinte
        // penduraria os seus eventos num trace já encerrado.
        const ligacao = await traceDoDashboard();
        const { runner } = build({ gate: new FakeGate(1_800_000) });

        const outcome = await runner.run(job(ligacao));

        expect(outcome.status).toBe("deferred");
        expect(estadoDoTrace()).toBe("open");
        // O passo desta passagem fica legível na mesma: ignorado por pausa.
        expect(eventoJobStarted()?.status).toBe("skipped");
      });

      it("sem traceId na fila continua a não rebentar", async () => {
        const { runner } = build({ attempts: new FakeAttempts(5) });

        expect(await runner.run(job())).toMatchObject({ reason: "daily_cap_reached" });
      });
    });

    it("falha retentável com tentativas por gastar deixa o trace ABERTO", async () => {
      // A tentativa seguinte continua o mesmo trace: fechá-lo aqui partiria a
      // cadeia em pedaços soltos, um por tentativa.
      const { runner } = build({ declarations: new FakeDeclarations(new Error("timeout")) });

      const outcome = await runner.run(job({ attempts: 1, maxAttempts: 3 }));

      expect(outcome).toMatchObject({ status: "failed", retry: true });
      expect(estadoDoTrace()).toBe("open");
      expect(eventoJobStarted()?.status).toBe("failed");
    });

    it("na última tentativa o trace fecha falhado", async () => {
      const { runner } = build({ declarations: new FakeDeclarations(new Error("timeout")) });

      await runner.run(job({ attempts: 3, maxAttempts: 3 }));

      expect(estadoDoTrace()).toBe("failed");
    });

    it("falha não retentável fecha o trace mesmo com tentativas por gastar", async () => {
      const { runner } = build({
        declarations: new FakeDeclarations(new StructuralError("tabela irreconhecível")),
      });

      await runner.run(job({ attempts: 1, maxAttempts: 3 }));

      expect(estadoDoTrace()).toBe("failed");
    });
  });

  describe("salvaguardas", () => {
    it("fecha a sessão sempre — inclusive quando a captura falha", async () => {
      const { runner, sessions } = build({
        documents: new FakeDocuments(new Error("timeout")),
      });

      await runner.run(job());

      expect(sessions.opened).toBe(1);
      expect(sessions.closed).toBe(1);
    });

    it("espera um jitter antes de abrir a sessão", async () => {
      const { runner, sleeps } = build({ policy: { jitterMs: 2000 } });

      await runner.run(job());

      expect(sleeps).toHaveLength(1);
      expect(sleeps[0]).toBeGreaterThanOrEqual(0);
      expect(sleeps[0]).toBeLessThan(2000);
    });

    it("expõe o ritmo ao ciclo — 182 empresas a 5 s são 30 minutos de propósito", () => {
      expect(build().runner.pacingMs).toBe(5000);
      expect(build({ policy: { pacingMs: 9000 } }).runner.pacingMs).toBe(9000);
    });

    it("o cap diário é configurável", async () => {
      const { runner } = build({ attempts: new FakeAttempts(2), policy: { dailyAttemptCap: 2 } });

      expect(await runner.run(job())).toMatchObject({ reason: "daily_cap_reached" });
    });
  });

  /**
   * O que sai daqui vai para `jobs.result`, `last_error`, `events` e `logs` —
   * tabelas que o gabinete inteiro lê. Nada disso pode conter a senha, o NIF, o
   * nome da empresa, a referência de pagamento, o valor ou um cookie.
   */
  describe("selo RGPD", () => {
    it("nem eventos, nem logs, nem o desfecho levam segredos ou dados do cliente", async () => {
      const { runner } = build();

      const outcome = await runner.run(job());

      const tudo = JSON.stringify({
        eventos: [...store.events.values()],
        logs: [...store.logs.values()],
        outcome,
      });
      for (const proibido of [
        SENHA,
        NIF,
        NOME_EMPRESA,
        REFERENCIA,
        ENTIDADE,
        VALOR,
        "1234.56",
        "cookie",
      ]) {
        expect(tudo).not.toContain(proibido);
      }
    });

    it("também não os leva quando a AT recusa a senha", async () => {
      const { runner } = build({
        sessions: new FakeSessions({ failure: new AtAuthError("rejected", 1) }),
      });

      const outcome = await runner.run(job());

      const tudo = JSON.stringify({
        eventos: [...store.events.values()],
        logs: [...store.logs.values()],
        outcome,
      });
      for (const proibido of [SENHA, NIF, NOME_EMPRESA, "cookie"]) {
        expect(tudo).not.toContain(proibido);
      }
    });

    it("erro genérico (ex.: timeout do Playwright) não leva o URL nem o NIF que traz embutidos", async () => {
      // Um `TimeoutError` real grava o URL que estava a navegar na própria
      // mensagem — e esse URL pode levar o NIF na query string. A mensagem
      // que fica em `last_error`/`outcome.message` tem de ser sempre a
      // etiqueta PT do desfecho, nunca o texto do erro original.
      const { runner } = build({
        documents: new FakeDocuments(
          new Error(
            `Timeout 30000ms exceeded navigating to https://sitfiscal.portaldasfinancas.example/pagamentos?nif=${NIF}`,
          ),
        ),
      });

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("failed");
      const tudo = JSON.stringify({
        eventos: [...store.events.values()],
        logs: [...store.logs.values()],
        outcome,
      });
      for (const proibido of [NIF, "https://"]) {
        expect(tudo).not.toContain(proibido);
      }
    });
  });
});
