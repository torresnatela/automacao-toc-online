import { describe, it, expect } from "vitest";
import { ivaFetchReadiness, selectAccessCredential, type AtAccessMode } from "@toc/core/domain";
import {
  FORCE_FLAG,
  accessFromForm,
  buildBulkRows,
  bulkRowsFromReads,
  companyForEnqueue,
  credentialForReadiness,
  forceFromForm,
  onlyMissingFromForm,
  resolveJobInsert,
  summarizeBulkPlan,
  tallyBulk,
  toCredentialCandidates,
  toSafeCredentialCandidates,
  type CredentialRow,
} from "@/lib/documents/bulk";
import type { IvaDocumentRow } from "@/lib/documents/present";

const TEAM_CRED = "aaaaaaaa-0000-0000-0000-000000000001";
const COMPANY_CRED = "aaaaaaaa-0000-0000-0000-000000000002";
const LIGADA = "33333333-3333-3333-3333-333333333333";
const OUTRA = "44444444-4444-4444-4444-444444444444";

function credRow(over: Partial<CredentialRow> = {}): CredentialRow {
  return {
    id: TEAM_CRED,
    provider: "at",
    company_id: null,
    status: "active",
    secret_encrypted: "v1:iv:tag:ct",
    metadata: null,
    ...over,
  };
}

describe("toCredentialCandidates", () => {
  it("traduz a linha da BD no candidato do domínio (segredo = coluna não nula)", () => {
    const [candidate] = toCredentialCandidates([credRow()]);
    expect(candidate).toEqual({
      id: TEAM_CRED,
      provider: "at",
      companyId: null,
      status: "active",
      hasSecret: true,
    });
  });

  it("um marcador (sem segredo) continua candidato — é ele que bloqueia a rota", () => {
    const [candidate] = toCredentialCandidates([
      credRow({
        secret_encrypted: null,
        status: "invalid",
        metadata: { invalidReason: "blocked" },
      }),
    ]);
    expect(candidate?.hasSecret).toBe(false);
    expect(candidate?.invalidReason).toBe("blocked");
  });

  it("descarta linhas cujo provider ou estado este build não conhece", () => {
    const rows = [
      credRow({ provider: "mainframe" }),
      credRow({ id: COMPANY_CRED, status: "esquisito" }),
    ];
    expect(toCredentialCandidates(rows)).toEqual([]);
  });

  it("não deixa `invalidReason` entrar quando o metadata não é texto", () => {
    const [candidate] = toCredentialCandidates([credRow({ metadata: { invalidReason: 42 } })]);
    expect(candidate).not.toHaveProperty("invalidReason");
  });
});

describe("credentialForReadiness", () => {
  // O ponto: a prontidão e a escolha da credencial têm de concordar. Se
  // discordarem, o botão diz «pronta» e o serviço recusa a seguir — ou pior,
  // enfileira-se um job condenado.
  const scenarios: {
    name: string;
    access: AtAccessMode;
    rows: CredentialRow[];
    selectionOk: boolean;
  }[] = [
    {
      name: "rota B sem credencial nenhuma",
      access: "at_direct_login",
      rows: [],
      selectionOk: false,
    },
    {
      name: "rota B com credencial de equipa ativa",
      access: "at_direct_login",
      rows: [credRow()],
      selectionOk: true,
    },
    {
      name: "rota B com credencial da empresa a sobrepor-se à da equipa",
      access: "at_direct_login",
      rows: [credRow(), credRow({ id: COMPANY_CRED, company_id: LIGADA })],
      selectionOk: true,
    },
    {
      name: "rota B com marcador da empresa a bloquear a da equipa",
      access: "at_direct_login",
      rows: [
        credRow(),
        credRow({
          id: COMPANY_CRED,
          company_id: LIGADA,
          secret_encrypted: null,
          status: "invalid",
        }),
      ],
      selectionOk: false,
    },
    {
      name: "rota A com credencial TOConline ativa",
      access: "toconline_direct_access",
      rows: [credRow({ provider: "toconline" })],
      selectionOk: true,
    },
    {
      name: "rota A com só a credencial da AT guardada",
      access: "toconline_direct_access",
      rows: [credRow()],
      selectionOk: false,
    },
  ];

  for (const s of scenarios) {
    it(`concorda com selectAccessCredential — ${s.name}`, () => {
      const candidates = toCredentialCandidates(s.rows);
      const readiness = ivaFetchReadiness({
        access: s.access,
        company: { status: "active", tocCompanyId: 1, tocCluster: 2, nif: "501234560" },
        credential: credentialForReadiness(s.access, LIGADA, candidates),
        inFlight: false,
      });
      const selection = selectAccessCredential(s.access, LIGADA, candidates);
      expect(readiness.ready).toBe(s.selectionOk);
      expect(selection.ok).toBe(s.selectionOk);
    });
  }

  it("o marcador sem segredo é lido como inválido, não como ausente", () => {
    const candidates = toCredentialCandidates([
      credRow(),
      credRow({ id: COMPANY_CRED, company_id: LIGADA, secret_encrypted: null, status: "expired" }),
    ]);
    const readiness = ivaFetchReadiness({
      access: "at_direct_login",
      company: { status: "active", tocCompanyId: null, tocCluster: null, nif: "501234560" },
      credential: credentialForReadiness("at_direct_login", LIGADA, candidates),
      inFlight: false,
    });
    expect(readiness).toEqual({ ready: false, reason: "credential_invalid" });
  });
});

describe("buildBulkRows", () => {
  const companies = [
    {
      id: LIGADA,
      status: "active",
      nif: "501234560",
      toconline_company_id: 515814,
      toconline_cluster: 5,
    },
    { id: OUTRA, status: "active", nif: null, toconline_company_id: null, toconline_cluster: null },
  ];

  it("marca em curso pelo conjunto de jobs e reaproveita o desfecho da listagem", () => {
    const rows = buildBulkRows({
      access: "at_direct_login",
      companies,
      candidates: toCredentialCandidates([credRow()]),
      inFlight: new Set([LIGADA]),
      lastByCompany: new Map([
        [LIGADA, { outcome: "fetched", finishedAt: "2026-09-02T10:00:00Z" }],
      ]),
    });

    expect(rows[0]).toEqual({
      companyId: LIGADA,
      readiness: { ready: false, reason: "in_flight" },
      lastOutcome: "fetched",
      lastFinishedAt: "2026-09-02T10:00:00Z",
    });
    // Rota B: sem NIF a empresa não é buscável, mesmo com credencial de equipa.
    expect(rows[1]).toEqual({
      companyId: OUTRA,
      readiness: { ready: false, reason: "nif_missing" },
      lastOutcome: null,
      lastFinishedAt: null,
    });
  });
});

describe("tallyBulk", () => {
  const plan = {
    toEnqueue: ["a", "b", "c"],
    skipped: {
      alreadyRunning: ["d"],
      notReady: {
        in_flight: [],
        company_inactive: ["e"],
        company_not_linked: [],
        nif_missing: ["f", "g"],
        credential_missing: [],
        credential_invalid: [],
      },
      alreadyFetched: ["h", "i"],
    },
  };

  it("soma o plano com o que cada enfileiramento devolveu", () => {
    const counts = tallyBulk(plan, ["enqueued", "already_running", "failed"]);
    expect(counts.enqueued).toBe(1);
    // 1 do plano + 1 que corria já quando lá chegámos (corrida).
    expect(counts.skipped.alreadyRunning).toBe(2);
    // 3 do plano + 1 recusado pelo serviço.
    expect(counts.skipped.notReady).toBe(4);
    expect(counts.skipped.alreadyFetched).toBe(2);
  });

  it("os motivos vêm só com os que têm empresas — a interface não mostra zeros", () => {
    const counts = tallyBulk(plan, ["enqueued", "enqueued", "enqueued"]);
    expect(counts.notReadyReasons).toEqual({ company_inactive: 1, nif_missing: 2 });
    expect(counts.enqueued).toBe(3);
  });
});

describe("bulkRowsFromReads", () => {
  const companies = [
    {
      id: LIGADA,
      status: "active",
      nif: "501234560",
      toconline_company_id: 515814,
      toconline_cluster: 5,
    },
  ];
  const ok = <T>(data: T[]) => ({ data, error: null });
  const boom = { data: null, error: { message: "boom" } };

  /** Uma linha da view com o mínimo que o lote lhe vai buscar. */
  function listagem(over: Partial<IvaDocumentRow> = {}): IvaDocumentRow {
    return {
      company_id: LIGADA,
      job_status: "succeeded",
      job_outcome: "fetched",
      job_finished_at: "2026-09-02T10:00:00Z",
      period: null,
      due_date: null,
      job_period: null,
      job_access: null,
      ...over,
    } as IvaDocumentRow;
  }

  const base = {
    access: "at_direct_login" as const,
    companies: ok(companies),
    credentials: ok([credRow()]),
    inFlight: ok<{ company_id: string | null }>([]),
    listing: ok([listagem()]),
  };

  it("monta as linhas com o que em curso e o último desfecho dizem", () => {
    const planned = bulkRowsFromReads({
      ...base,
      inFlight: ok<{ company_id: string | null }>([{ company_id: LIGADA }]),
    });
    expect(planned).toEqual({
      ok: true,
      rows: [
        {
          companyId: LIGADA,
          readiness: { ready: false, reason: "in_flight" },
          lastOutcome: "fetched",
          lastFinishedAt: "2026-09-02T10:00:00Z",
        },
      ],
    });
  });

  it("sem listagem (onlyMissing falso) não há desfecho anterior a considerar", () => {
    const planned = bulkRowsFromReads({ ...base, listing: null });
    expect(planned.ok && planned.rows[0]?.lastOutcome).toBe(null);
  });

  // O ponto de todas estas: uma leitura falhada não pode virar «0 enfileiradas»
  // a verde. O lote que não sabe que empresas existe não é um lote de zero.
  it.each([
    ["empresas", { companies: boom }],
    ["credenciais", { credentials: boom }],
    ["jobs em curso", { inFlight: boom }],
    ["listagem", { listing: boom }],
  ])("falha alto quando a leitura de %s falha", (rotulo, override) => {
    const planned = bulkRowsFromReads({ ...base, ...override });
    expect(planned.ok).toBe(false);
    // A mensagem diz QUAL leitura falhou — é ela que vai para o trace.
    expect(planned.ok === false && planned.error).toContain("boom");
    expect(planned.ok === false && planned.error).toContain(rotulo);
  });
});

describe("resolveJobInsert", () => {
  const JOB = "eeeeeeee-0000-0000-0000-000000000001";
  const EM_CURSO = "eeeeeeee-0000-0000-0000-000000000002";
  const nunca = async () => {
    throw new Error("não devia reler o job em curso");
  };

  it("inserção limpa entrega o trace ao worker", async () => {
    const resolution = await resolveJobInsert({ data: { id: JOB }, error: null }, nunca);
    expect(resolution).toEqual({
      trace: { close: "handOff" },
      result: { ok: true, jobId: JOB, alreadyRunning: false },
    });
  });

  // O ramo do índice parcial `jobs_company_inflight_uq`: não é falha de ninguém,
  // e fechar o trace como erro mandaria alguém investigar um duplo-clique.
  it("23505 fecha o trace como saltado e devolve o job que já lá estava", async () => {
    const resolution = await resolveJobInsert(
      { data: null, error: { code: "23505", message: 'duplicate key value violates "jobs_..."' } },
      async () => EM_CURSO,
    );
    expect(resolution.trace).toEqual({ close: "skipped", reason: "already_running" });
    expect(resolution.result).toEqual({ ok: true, jobId: EM_CURSO, alreadyRunning: true });
  });

  it("23505 sem job na releitura continua saltado, mas sem nada que devolver", async () => {
    const resolution = await resolveJobInsert(
      { data: null, error: { code: "23505", message: "duplicate key" } },
      async () => null,
    );
    expect(resolution.trace).toEqual({ close: "skipped", reason: "already_running" });
    expect(resolution.result).toEqual({ ok: false, status: 500, error: "Erro interno." });
  });

  it("outro erro falha o trace com a mensagem crua e devolve-a genérica", async () => {
    const crua = 'null value in column "team_id" violates not-null constraint';
    const resolution = await resolveJobInsert(
      { data: null, error: { code: "23502", message: crua } },
      nunca,
    );
    expect(resolution.trace).toEqual({ close: "failure", message: crua });
    // A mensagem do Postgres fica no trace e NUNCA no que o operador lê.
    expect(resolution.result).toEqual({ ok: false, status: 500, error: "Erro interno." });
  });

  it("inserção sem erro e sem linha é falha, não sucesso silencioso", async () => {
    const resolution = await resolveJobInsert({ data: null, error: null }, nunca);
    expect(resolution.trace.close).toBe("failure");
    expect(resolution.result).toEqual({ ok: false, status: 500, error: "Erro interno." });
  });
});

describe("toSafeCredentialCandidates", () => {
  // A página lê a view `integration_credentials_safe` (sem ciphertext): o que
  // lá está é `has_secret`, e é dele que sai o mesmo candidato do domínio.
  it("traduz a linha da view segura no mesmo candidato", () => {
    expect(
      toSafeCredentialCandidates([
        {
          id: TEAM_CRED,
          provider: "at",
          company_id: null,
          status: "active",
          has_secret: true,
          metadata: null,
        },
      ]),
    ).toEqual([
      { id: TEAM_CRED, provider: "at", companyId: null, status: "active", hasSecret: true },
    ]);
  });

  it("mantém o marcador (sem segredo) e a sua causa", () => {
    const [candidate] = toSafeCredentialCandidates([
      {
        id: COMPANY_CRED,
        provider: "at",
        company_id: LIGADA,
        status: "invalid",
        has_secret: false,
        metadata: { invalidReason: "login_rejeitado" },
      },
    ]);
    expect(candidate?.hasSecret).toBe(false);
    expect(candidate?.invalidReason).toBe("login_rejeitado");
  });

  it("descarta o que este build não conhece, tal como a leitura da tabela", () => {
    expect(
      toSafeCredentialCandidates([
        {
          id: TEAM_CRED,
          provider: "mainframe",
          company_id: null,
          status: "active",
          has_secret: true,
          metadata: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("summarizeBulkPlan", () => {
  const plan = {
    toEnqueue: ["a", "b", "c"],
    skipped: {
      alreadyRunning: ["d"],
      notReady: {
        in_flight: [],
        company_inactive: ["e"],
        company_not_linked: [],
        nif_missing: ["f", "g"],
        credential_missing: [],
        credential_invalid: [],
      },
      alreadyFetched: ["h", "i"],
    },
  };

  it("dá ao diálogo os números que ele anuncia antes de enfileirar", () => {
    expect(summarizeBulkPlan(plan)).toEqual({
      ready: 3,
      inFlight: 1,
      notReady: 3,
      alreadyFetched: 2,
      notReadyReasons: { company_inactive: 1, nif_missing: 2 },
    });
  });
});

describe("leitura das opções do formulário", () => {
  // O `force` é um `<input type="hidden">` (valor fixo `"1"`), o `onlyMissing`
  // um checkbox (o browser só o envia marcado, e ausente TEM de valer `false`).
  it("força a re-busca só com o valor exato do campo escondido", () => {
    expect(forceFromForm(FORCE_FLAG)).toBe(true);
    expect(forceFromForm("on")).toBe(false);
    expect(forceFromForm(null)).toBe(false);
  });

  it("o checkbox ausente significa «não ignorar nada»", () => {
    expect(onlyMissingFromForm("on")).toBe(true);
    expect(onlyMissingFromForm(null)).toBe(false);
    expect(onlyMissingFromForm("1")).toBe(false);
  });

  it("lê o modo de acesso do campo escondido e cai na rota B com o que não conhece", () => {
    // Cada botão escreve a sua rota; um formulário antigo (sem o campo) ou um
    // valor forjado não podem escolher uma rota que ninguém pediu — e a B é a
    // que não depende de nada configurado no TOConline.
    expect(accessFromForm("toconline_direct_access")).toBe("toconline_direct_access");
    expect(accessFromForm("at_direct_login")).toBe("at_direct_login");
    expect(accessFromForm(null)).toBe("at_direct_login");
    expect(accessFromForm("lixo")).toBe("at_direct_login");
  });
});

describe("companyForEnqueue", () => {
  const TEAM = "22222222-2222-2222-2222-222222222222";
  const empresa = { team_id: TEAM };

  it("devolve a empresa da equipa do pedido", () => {
    expect(companyForEnqueue({ data: empresa, error: null }, TEAM)).toEqual({
      ok: true,
      company: empresa,
    });
  });

  it("404 para a empresa que não existe ou é de outra equipa", () => {
    // 404 e não 403: quem não a pode ver também não tem de saber que existe.
    expect(companyForEnqueue({ data: null, error: null }, TEAM)).toEqual({
      ok: false,
      status: 404,
      error: "Empresa não encontrada.",
    });
    expect(companyForEnqueue({ data: { team_id: "outra" }, error: null }, TEAM)).toMatchObject({
      status: 404,
    });
  });

  it("500 quando a leitura falhou — não é uma empresa que não existe", () => {
    // Com 404 aqui, uma indisponibilidade da base mandava o operador procurar
    // uma empresa que está lá.
    expect(
      companyForEnqueue({ data: null, error: { message: "connection refused" } }, TEAM),
    ).toEqual({ ok: false, status: 500, error: "Erro interno." });
  });
});
