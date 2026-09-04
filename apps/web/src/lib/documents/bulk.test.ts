import { describe, it, expect } from "vitest";
import { ivaFetchReadiness, selectAccessCredential, type AtAccessMode } from "@toc/core/domain";
import {
  buildBulkRows,
  credentialForReadiness,
  tallyBulk,
  toCredentialCandidates,
  type CredentialRow,
} from "@/lib/documents/bulk";

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
