import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStore, createTracer } from "@toc/core";
import { SCAN_COUNT_KEYS, type ExistingCompany, type ReconcilePlan } from "@toc/core/domain";
import { CompanyScanRunner } from "../../src/runner/company-scan-runner";
import type {
  AuthenticatedTocSession,
  CompanyDirectory,
  CompanyScanner,
  CredentialLookup,
  CredentialSource,
  OpenedSession,
  TocSessionFactory,
  UpsertReport,
} from "../../src/runner/ports";
import type { GridProjection } from "../../src/toconline/project-grid";
import type { ClaimedJob } from "../../src/runner/job-queue";
import { StructuralError, InvalidCredentialsError } from "../../src/errors";

const TEAM = "22222222-2222-2222-2222-222222222222";
const CREDENTIAL = "cred-1";
const SENHA = "senha-do-gabinete";
const NIF_A = "501442600";
const NIF_B = "502011378";

let store: InMemoryStore;

beforeEach(() => {
  store = new InMemoryStore();
});

function job(over: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    type: "rpa.scan_companies",
    payload: { teamId: TEAM, credentialId: CREDENTIAL },
    attempts: 1,
    maxAttempts: 3,
    traceId: null,
    triggeringEventId: null,
    ...over,
  };
}

/** Linha do grid como sai do browser (o runner não a valida — o domínio valida). */
function rawRow(id: number, nif: string, name = `Empresa ${id}`) {
  return {
    id,
    tax_number: nif,
    name,
    cluster: 5,
    status: "active",
    i18n_status: "Ativa",
    demo: false,
    accounting: true,
    roles: "Contabilista responsável",
  };
}

class FakeCredentials implements CredentialSource {
  readonly verified: string[] = [];
  readonly invalidated: { id: string; reason: string }[] = [];

  constructor(
    private readonly lookup: CredentialLookup = {
      ok: true,
      credentials: { username: "gabinete@example.pt", password: SENHA },
    },
  ) {}

  async load(): Promise<CredentialLookup> {
    return this.lookup;
  }
  async markVerified(id: string) {
    this.verified.push(id);
  }
  async markInvalid(id: string, reason: string) {
    this.invalidated.push({ id, reason });
  }
}

class FakeSessions implements TocSessionFactory {
  opened = 0;
  closed = 0;
  constructor(private readonly failure?: Error) {}

  async open(): Promise<OpenedSession> {
    if (this.failure) throw this.failure;
    this.opened += 1;
    const session: AuthenticatedTocSession = {
      // O runner nunca toca na Page — só a repassa ao scanner, que aqui é falso.
      page: {} as AuthenticatedTocSession["page"],
      host: "app5.toconline.pt",
      close: async () => {
        this.closed += 1;
      },
    };
    return { session, reused: false };
  }
}

class FakeScanner implements CompanyScanner {
  calls = 0;
  constructor(private readonly outcome: GridProjection | Error) {}

  async scan(): Promise<GridProjection> {
    this.calls += 1;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

class FakeDirectory implements CompanyDirectory {
  readonly applied: ReconcilePlan[] = [];
  constructor(private readonly existing: ExistingCompany[] = []) {}

  async list(): Promise<ExistingCompany[]> {
    return this.existing;
  }
  async apply(_teamId: string, plan: ReconcilePlan): Promise<UpsertReport> {
    this.applied.push(plan);
    return {
      created: plan.summary.create,
      linked: plan.summary.link,
      updated: plan.summary.update,
      unchanged: plan.summary.unchanged,
      missing: plan.summary.missing,
      conflicts: plan.summary.conflict,
    };
  }
}

function gridOf(rows: unknown[]): GridProjection {
  return { rows: rows as GridProjection["rows"], reportedSize: rows.length, via: "items" };
}

function build(opts: {
  credentials?: FakeCredentials;
  sessions?: FakeSessions;
  scanner?: FakeScanner;
  directory?: FakeDirectory;
}) {
  const deps = {
    tracer: createTracer(store),
    store,
    credentials: opts.credentials ?? new FakeCredentials(),
    sessions: opts.sessions ?? new FakeSessions(),
    scanner: opts.scanner ?? new FakeScanner(gridOf([rawRow(1, NIF_A), rawRow(2, NIF_B)])),
    directory: opts.directory ?? new FakeDirectory(),
  };
  return { runner: new CompanyScanRunner(deps), deps };
}

describe("CompanyScanRunner", () => {
  it("caminho feliz: varre, reconcilia e devolve as contagens", async () => {
    const directory = new FakeDirectory();
    const { runner } = build({ directory });

    const outcome = await runner.run(job());

    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") return;
    expect(outcome.result).toMatchObject({ scanned: 2, created: 2, host: "app5.toconline.pt" });
    expect(directory.applied).toHaveLength(1);
  });

  it("fecha a sessão sempre — inclusive quando a varredura falha", async () => {
    const sessions = new FakeSessions();
    const { runner } = build({ sessions, scanner: new FakeScanner(new Error("timeout")) });

    await runner.run(job());

    expect(sessions.opened).toBe(1);
    expect(sessions.closed).toBe(1);
  });

  it("não persiste empresas demo", async () => {
    const directory = new FakeDirectory();
    const scanner = new FakeScanner(
      gridOf([rawRow(1, NIF_A), { ...rawRow(2, NIF_B), demo: true }]),
    );
    const { runner } = build({ scanner, directory });

    const outcome = await runner.run(job());

    expect(outcome.status).toBe("succeeded");
    const plan = directory.applied[0]!;
    expect(plan.summary.create).toBe(1);
    expect(plan.summary.skip).toBe(1);
  });

  /**
   * `jobs.result` é jsonb: nada no typecheck liga o que o worker escreve ao que
   * o dashboard lê. Se as chaves divergirem, a varredura corre bem e a página
   * mostra um resumo vazio — falha silenciosa, do lado errado.
   */
  describe("contrato de jobs.result", () => {
    it("usa exatamente as chaves que o dashboard lê", async () => {
      const { runner } = build({});

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect(Object.keys(outcome.result).sort()).toEqual(
        [...SCAN_COUNT_KEYS, "host", "via"].sort(),
      );
    });

    it("empresa demo conta como `skipped` — o nome que a página rotula", async () => {
      const scanner = new FakeScanner(
        gridOf([rawRow(1, NIF_A), { ...rawRow(2, NIF_B), demo: true }]),
      );
      const { runner } = build({ scanner });

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      expect(outcome.result.skipped).toBe(1);
      expect(outcome.result.persisted).toBe(1);
    });

    it("`persisted` não conta conflitos — um conflito não escreve nada", async () => {
      // NIF_A já está cá, mas ligado a OUTRO tocCompanyId: ambiguidade humana.
      const existing: ExistingCompany[] = [
        {
          id: "c1",
          nif: NIF_A,
          name: "Empresa antiga",
          status: "active",
          tocCompanyId: 999,
          tocCluster: 5,
        },
      ];
      const directory = new FakeDirectory(existing);
      const { runner } = build({ directory });

      const outcome = await runner.run(job());

      expect(outcome.status).toBe("succeeded");
      if (outcome.status !== "succeeded") return;
      const plan = directory.applied[0]!;
      expect(plan.summary.conflict).toBe(1);
      expect(outcome.result.persisted).toBe(
        plan.summary.create + plan.summary.link + plan.summary.update + plan.summary.unchanged,
      );
    });
  });

  describe("credenciais", () => {
    it("credencial inválida → skipped, sem sequer abrir o browser", async () => {
      const credentials = new FakeCredentials({ ok: false, reason: "invalid" });
      const sessions = new FakeSessions();
      const { runner } = build({ credentials, sessions });

      const outcome = await runner.run(job());

      expect(outcome).toEqual({ status: "skipped", reason: "credential_invalid" });
      expect(sessions.opened).toBe(0);
    });

    it("credencial inexistente → falha sem retry", async () => {
      const credentials = new FakeCredentials({ ok: false, reason: "not_found" });
      const { runner } = build({ credentials });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: false });
    });

    it("login rejeitado → marca a credencial inválida e não retenta", async () => {
      const credentials = new FakeCredentials();
      const sessions = new FakeSessions(new InvalidCredentialsError());
      const { runner } = build({ credentials, sessions });

      const outcome = await runner.run(job());

      expect(outcome).toMatchObject({ status: "failed", retry: false });
      expect(credentials.invalidated).toHaveLength(1);
      expect(credentials.invalidated[0]?.id).toBe(CREDENTIAL);
    });

    it("login bem-sucedido → marca a credencial verificada", async () => {
      const credentials = new FakeCredentials();
      const { runner } = build({ credentials });

      await runner.run(job());

      expect(credentials.verified).toEqual([CREDENTIAL]);
    });
  });

  describe("classificação de erro", () => {
    it("StructuralError não é retentável", async () => {
      const scanner = new FakeScanner(new StructuralError("grid desapareceu"));
      const { runner } = build({ scanner });

      expect(await runner.run(job())).toMatchObject({ status: "failed", retry: false });
    });

    it("erro genérico é retentável", async () => {
      const scanner = new FakeScanner(new Error("ECONNRESET"));
      const { runner } = build({ scanner });

      expect(await runner.run(job())).toMatchObject({ status: "failed", retry: true });
    });

    it("payload sem teamId ou credentialId → falha sem retry e sem abrir sessão", async () => {
      const sessions = new FakeSessions();
      const { runner } = build({ sessions });

      const outcome = await runner.run(job({ payload: { teamId: TEAM } }));

      expect(outcome).toMatchObject({ status: "failed", retry: false });
      expect(sessions.opened).toBe(0);
    });

    it("as guardas de integridade falham sem retry", async () => {
      // O grid anuncia 10 mas entrega 1 — leitura truncada.
      const scanner = new FakeScanner({
        rows: [rawRow(1, NIF_A)] as GridProjection["rows"],
        reportedSize: 10,
        via: "items",
      });
      const { runner } = build({ scanner });

      expect(await runner.run(job())).toMatchObject({ status: "failed", retry: false });
    });

    it("encolhimento face à varredura anterior falha sem retry", async () => {
      const existing: ExistingCompany[] = Array.from({ length: 100 }, (_, i) => ({
        id: `u${i}`,
        nif: null,
        name: `E${i}`,
        status: "active" as const,
        tocCompanyId: i + 1,
        tocCluster: 5,
      }));
      const { runner } = build({ directory: new FakeDirectory(existing) });

      expect(await runner.run(job())).toMatchObject({ status: "failed", retry: false });
    });
  });

  /**
   * O dashboard abre o trace e entrega-o (`handOff`) — quem o fecha é o worker.
   * Se o worker consome o job e volta atrás antes de tocar no trace, aquele
   * trace fica aberto para sempre e passa a ser indistinguível de um job
   * enfileirado e nunca consumido, que é precisamente o sinal que ele existe
   * para dar.
   */
  describe("saídas antecipadas fecham o trace do dashboard", () => {
    async function traceDoDashboard() {
      const trace = await createTracer(store).startTrace({
        rootTrigger: "manual",
        triggerSource: "integrations.toconline.scan",
      });
      const enqueued = await trace.event({ type: "job.enqueued", source: "web" });
      // `handOff()`: o evento fecha com sucesso, o trace fica ABERTO à espera
      // do worker. É este o estado exato que a fila entrega.
      await enqueued.succeed();
      return { traceId: trace.id, triggeringEventId: enqueued.id };
    }

    const estadoDoTrace = () => [...store.traces.values()][0]?.status;
    const jobStarted = () => [...store.events.values()].find((e) => e.type === "job.started");

    it("payload inválido não deixa o trace aberto", async () => {
      const ligacao = await traceDoDashboard();
      const { runner } = build({});

      const outcome = await runner.run(job({ ...ligacao, payload: { teamId: TEAM } }));

      expect(outcome).toMatchObject({ status: "failed", retry: false });
      expect(estadoDoTrace()).toBe("failed");
      expect(jobStarted()?.status).toBe("failed");
    });

    it("credencial inexistente não deixa o trace aberto", async () => {
      const ligacao = await traceDoDashboard();
      const credentials = new FakeCredentials({ ok: false, reason: "not_found" });
      const { runner } = build({ credentials });

      const outcome = await runner.run(job(ligacao));

      expect(outcome).toMatchObject({ status: "failed", retry: false });
      expect(estadoDoTrace()).toBe("failed");
      expect(jobStarted()?.status).toBe("failed");
    });

    it("credencial inválida encerra o trace e marca o evento como skipped", async () => {
      const ligacao = await traceDoDashboard();
      const credentials = new FakeCredentials({ ok: false, reason: "invalid" });
      const sessions = new FakeSessions();
      const { runner } = build({ credentials, sessions });

      const outcome = await runner.run(job(ligacao));

      expect(outcome).toEqual({ status: "skipped", reason: "credential_invalid" });
      expect(sessions.opened).toBe(0);
      // Nada falhou — o job foi ignorado de propósito. O trace fecha concluído.
      expect(estadoDoTrace()).toBe("completed");
      expect(jobStarted()?.status).toBe("skipped");
      // O enfileiramento em si SUCEDEU: reescrevê-lo como ignorado seria mentir
      // sobre o que o dashboard fez.
      expect(store.events.get(ligacao.triggeringEventId)?.status).toBe("succeeded");
    });

    it("sem traceId na fila continua a não rebentar", async () => {
      const credentials = new FakeCredentials({ ok: false, reason: "invalid" });
      const { runner } = build({ credentials });

      expect(await runner.run(job())).toEqual({ status: "skipped", reason: "credential_invalid" });
    });
  });

  describe("observabilidade", () => {
    it("continua o trace vindo da fila em vez de abrir outro", async () => {
      const trace = await createTracer(store).startTrace({ rootTrigger: "manual" });
      const enqueued = await trace.event({ type: "job.enqueued", source: "web" });
      const { runner } = build({});

      await runner.run(job({ traceId: trace.id, triggeringEventId: enqueued.id }));

      expect(store.traces.size).toBe(1);
      const started = [...store.events.values()].find((e) => e.type === "job.started");
      expect(started?.parentEventId).toBe(enqueued.id);
      expect(started?.traceId).toBe(trace.id);
    });

    it("abre trace próprio quando o job não traz um, com a chave de correlação", async () => {
      const { runner } = build({});

      await runner.run(job());

      const [trace] = [...store.traces.values()];
      expect(trace?.correlationKey).toBe(`team:${TEAM}:toconline`);
      expect(trace?.triggerSource).toBe("worker:scan_companies");
    });

    it("encadeia os passos como filhos de job.started", async () => {
      const { runner } = build({});
      await runner.run(job());

      const events = [...store.events.values()];
      const started = events.find((e) => e.type === "job.started")!;
      const tipos = events.filter((e) => e.parentEventId === started.id).map((e) => e.type);

      expect(tipos).toEqual([
        "rpa.toconline.session",
        "rpa.toconline.scan_companies",
        "integration.companies_synced",
      ]);
    });

    it("fecha o trace com sucesso no caminho feliz", async () => {
      const { runner } = build({});
      await runner.run(job());

      expect([...store.traces.values()][0]?.status).toBe("completed");
    });

    it("marca o trace como falhado quando a varredura rebenta", async () => {
      const { runner } = build({ scanner: new FakeScanner(new StructuralError("x")) });
      await runner.run(job());

      expect([...store.traces.values()][0]?.status).toBe("failed");
    });

    // O selo de RGPD: 182 nomes e NIFs de clientes não podem viver na
    // observabilidade, e a senha muito menos.
    it("nunca escreve senha, cookies, nomes de empresa ou NIFs", async () => {
      const scanner = new FakeScanner(
        gridOf([rawRow(1, NIF_A, "Padaria do Zé, Lda"), rawRow(2, NIF_B, "Táxis Silva")]),
      );
      const { runner } = build({ scanner });

      await runner.run(job());

      const dump = JSON.stringify([...store.events.values(), ...store.logs.values()]);
      expect(dump).not.toContain(SENHA);
      expect(dump).not.toContain("Padaria do Zé");
      expect(dump).not.toContain("Táxis Silva");
      expect(dump).not.toContain(NIF_A);
      expect(dump).not.toContain("cookie");
    });

    it("regista as contagens em log (succeed não aceita payload)", async () => {
      const { runner } = build({});
      await runner.run(job());

      const dump = JSON.stringify([...store.logs.values()]);
      expect(dump).toContain("created");
    });
  });
});
