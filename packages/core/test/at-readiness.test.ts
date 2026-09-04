import { describe, it, expect } from "vitest";
import { ivaFetchReadiness, planBulkFetch, providerForAccess } from "../src/domain/at/readiness";
import type { BulkRow } from "../src/domain/at/readiness";
import type { AtAccessMode } from "../src/domain/at/types";

type ReadinessInput = Parameters<typeof ivaFetchReadiness>[0];

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    access: "toconline_direct_access",
    company: { status: "active", tocCompanyId: 515814, tocCluster: 5, nif: "501442600" },
    credential: { hasSecret: true, status: "active" },
    inFlight: false,
    ...over,
  };
}

describe("providerForAccess", () => {
  it("mapeia o modo de acesso ao fornecedor da credencial", () => {
    expect(providerForAccess("toconline_direct_access")).toBe("toconline");
    expect(providerForAccess("at_direct_login")).toBe("at");
  });
});

describe("ivaFetchReadiness", () => {
  it("pronta quando tudo está no sítio, nos dois modos", () => {
    for (const access of ["toconline_direct_access", "at_direct_login"] as AtAccessMode[]) {
      expect(ivaFetchReadiness(input({ access })), access).toEqual({ ready: true });
    }
  });

  it("um job em curso ganha a tudo o resto", () => {
    expect(
      ivaFetchReadiness(
        input({
          inFlight: true,
          credential: null,
          company: { status: "inactive", tocCompanyId: null, tocCluster: null, nif: null },
        }),
      ),
    ).toEqual({ ready: false, reason: "in_flight" });
  });

  it("empresa inativa vem antes da credencial", () => {
    expect(
      ivaFetchReadiness(
        input({
          company: { status: "inactive", tocCompanyId: 1, tocCluster: 5, nif: "501442600" },
          credential: null,
        }),
      ),
    ).toEqual({ ready: false, reason: "company_inactive" });
  });

  it("credencial ausente, sem segredo ou não ativa", () => {
    expect(ivaFetchReadiness(input({ credential: null }))).toEqual({
      ready: false,
      reason: "credential_missing",
    });
    expect(
      ivaFetchReadiness(input({ credential: { hasSecret: false, status: "active" } })),
    ).toEqual({ ready: false, reason: "credential_missing" });
    for (const status of ["invalid", "expired"]) {
      expect(ivaFetchReadiness(input({ credential: { hasSecret: true, status } })), status).toEqual(
        {
          ready: false,
          reason: "credential_invalid",
        },
      );
    }
  });

  it("a credencial vem antes da identidade da empresa", () => {
    expect(
      ivaFetchReadiness(
        input({
          credential: null,
          company: { status: "active", tocCompanyId: null, tocCluster: null, nif: null },
        }),
      ),
    ).toEqual({ ready: false, reason: "credential_missing" });
  });

  describe("identidade da empresa por modo", () => {
    it("rota A exige a ligação ao TOConline (id + cluster)", () => {
      expect(
        ivaFetchReadiness(
          input({
            company: { status: "active", tocCompanyId: null, tocCluster: 5, nif: "501442600" },
          }),
        ),
      ).toEqual({ ready: false, reason: "company_not_linked" });
      expect(
        ivaFetchReadiness(
          input({
            company: { status: "active", tocCompanyId: 1, tocCluster: null, nif: "501442600" },
          }),
        ),
      ).toEqual({ ready: false, reason: "company_not_linked" });
      // Na rota A o NIF não é preciso: quem identifica a empresa é o TOConline.
      expect(
        ivaFetchReadiness(
          input({ company: { status: "active", tocCompanyId: 1, tocCluster: 5, nif: null } }),
        ),
      ).toEqual({ ready: true });
    });

    it("rota B exige NIF e dispensa a ligação ao TOConline", () => {
      expect(
        ivaFetchReadiness(
          input({
            access: "at_direct_login",
            company: { status: "active", tocCompanyId: null, tocCluster: null, nif: null },
          }),
        ),
      ).toEqual({ ready: false, reason: "nif_missing" });
      expect(
        ivaFetchReadiness(
          input({
            access: "at_direct_login",
            company: { status: "active", tocCompanyId: null, tocCluster: null, nif: "501442600" },
          }),
        ),
      ).toEqual({ ready: true });
    });
  });
});

describe("planBulkFetch", () => {
  const NOW = new Date("2026-09-03T10:00:00Z");

  function row(over: Partial<BulkRow> = {}): BulkRow {
    return {
      companyId: "c",
      readiness: { ready: true },
      lastOutcome: null,
      lastFinishedAt: null,
      ...over,
    };
  }

  it("enfileira as empresas prontas", () => {
    const plan = planBulkFetch([row({ companyId: "a" }), row({ companyId: "b" })], {
      onlyMissing: false,
      now: NOW,
    });
    expect(plan.toEnqueue).toEqual(["a", "b"]);
    expect(plan.skipped.alreadyRunning).toEqual([]);
    expect(plan.skipped.alreadyFetched).toEqual([]);
  });

  it("separa quem já está em curso de quem não está pronta", () => {
    const plan = planBulkFetch(
      [
        row({ companyId: "a", readiness: { ready: false, reason: "in_flight" } }),
        row({ companyId: "b", readiness: { ready: false, reason: "company_inactive" } }),
        row({ companyId: "c", readiness: { ready: false, reason: "credential_invalid" } }),
        row({ companyId: "d", readiness: { ready: false, reason: "company_inactive" } }),
      ],
      { onlyMissing: false, now: NOW },
    );
    expect(plan.toEnqueue).toEqual([]);
    expect(plan.skipped.alreadyRunning).toEqual(["a"]);
    expect(plan.skipped.notReady.company_inactive).toEqual(["b", "d"]);
    expect(plan.skipped.notReady.credential_invalid).toEqual(["c"]);
    expect(plan.skipped.notReady.nif_missing).toEqual([]);
  });

  it("onlyMissing salta quem já tem desfecho conclusivo no mês civil corrente", () => {
    const conclusive = [
      "fetched",
      "fetched_without_fields",
      "no_payment_document",
      "already_paid",
    ] as const;
    for (const lastOutcome of conclusive) {
      const plan = planBulkFetch(
        [row({ companyId: "a", lastOutcome, lastFinishedAt: "2026-09-01T08:00:00Z" })],
        { onlyMissing: true, now: NOW },
      );
      expect(plan.skipped.alreadyFetched, lastOutcome).toEqual(["a"]);
      expect(plan.toEnqueue, lastOutcome).toEqual([]);
    }
  });

  it("com onlyMissing desligado enfileira na mesma", () => {
    const plan = planBulkFetch(
      [row({ companyId: "a", lastOutcome: "fetched", lastFinishedAt: "2026-09-01T08:00:00Z" })],
      { onlyMissing: false, now: NOW },
    );
    expect(plan.toEnqueue).toEqual(["a"]);
  });

  it("o desfecho do mês anterior não conta como já obtida", () => {
    const plan = planBulkFetch(
      [
        row({ companyId: "a", lastOutcome: "fetched", lastFinishedAt: "2026-08-31T23:00:00Z" }),
        row({ companyId: "b", lastOutcome: "fetched", lastFinishedAt: null }),
      ],
      { onlyMissing: true, now: NOW },
    );
    expect(plan.toEnqueue).toEqual(["a", "b"]);
    expect(plan.skipped.alreadyFetched).toEqual([]);
  });

  it("um desfecho não conclusivo no mês corrente não trava a nova tentativa", () => {
    const plan = planBulkFetch(
      [
        row({
          companyId: "a",
          lastOutcome: "at_unavailable",
          lastFinishedAt: "2026-09-02T08:00:00Z",
        }),
        row({
          companyId: "b",
          lastOutcome: "declaration_not_submitted",
          lastFinishedAt: "2026-09-02T08:00:00Z",
        }),
      ],
      { onlyMissing: true, now: NOW },
    );
    expect(plan.toEnqueue).toEqual(["a", "b"]);
  });

  it("lida com uma lista vazia sem lançar", () => {
    const plan = planBulkFetch([], { onlyMissing: true, now: NOW });
    expect(plan.toEnqueue).toEqual([]);
    expect(Object.values(plan.skipped.notReady).every((ids) => ids.length === 0)).toBe(true);
  });
});
