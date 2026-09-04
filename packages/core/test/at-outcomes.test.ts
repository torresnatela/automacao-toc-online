import { describe, it, expect } from "vitest";
import {
  INVALID_REASON_LABELS,
  IVA_OUTCOMES,
  IVA_OUTCOME_CODES,
  readIvaOutcome,
  renderGuidance,
} from "../src/domain/at/outcomes";
import type { IvaOutcome, JobRowForOutcome } from "../src/domain/at/outcomes";
import { IVA_STAGES, parseIvaDocumentPayload } from "../src/domain/at/types";
import type { IvaDocumentJobPayload } from "../src/domain/at/types";

function job(over: Partial<JobRowForOutcome> = {}): JobRowForOutcome {
  return {
    status: "pending",
    result: null,
    last_error: null,
    attempts: 0,
    max_attempts: 3,
    ...over,
  };
}

describe("IVA_OUTCOMES", () => {
  it("cobre exatamente os códigos declarados — nem a mais nem a menos", () => {
    expect(Object.keys(IVA_OUTCOMES).sort()).toEqual([...IVA_OUTCOME_CODES].sort());
  });

  it("todo o código tem rótulo e orientação preenchidos", () => {
    for (const code of IVA_OUTCOME_CODES) {
      expect(IVA_OUTCOMES[code].label.trim(), code).not.toBe("");
      expect(IVA_OUTCOMES[code].guidance.trim(), code).not.toBe("");
    }
  });

  it("só um job failed pode retentar", () => {
    for (const code of IVA_OUTCOME_CODES) {
      const spec = IVA_OUTCOMES[code];
      if (spec.jobStatus !== "failed") expect(spec.retry, code).toBe(false);
    }
  });

  it("nenhum desfecho de autenticação retenta — cada tentativa gasta uma do contador da AT", () => {
    const authentication: IvaOutcome[] = [
      "at_login_rejected",
      "at_password_blocked",
      "at_password_expired",
      "at_2fa_required",
      "toconline_login_rejected",
    ];
    for (const code of authentication) {
      expect(IVA_OUTCOMES[code].retry, code).toBe(false);
      expect(IVA_OUTCOMES[code].jobStatus, code).toBe("failed");
    }
  });

  it("só portal_paused adia o job", () => {
    const deferred = IVA_OUTCOME_CODES.filter((c) => IVA_OUTCOMES[c].jobStatus === "deferred");
    expect(deferred).toEqual(["portal_paused"]);
  });

  it("os estados terminais do período só saem dos desfechos que os justificam", () => {
    const withStatus = (status: string) =>
      IVA_OUTCOME_CODES.filter((c) => IVA_OUTCOMES[c].periodStatus === status);
    expect(withStatus("delivered")).toEqual(["fetched", "fetched_without_fields"]);
    expect(withStatus("skipped_nonexistent")).toEqual(["no_payment_document"]);
    expect(withStatus("paid")).toEqual(["already_paid"]);
  });

  it("a credencial só se marca a partir do que o portal disse sobre ela", () => {
    expect(IVA_OUTCOMES.at_login_rejected.credential).toBe("invalidate");
    expect(IVA_OUTCOMES.at_password_expired.credential).toBe("expire");
    expect(IVA_OUTCOMES.at_2fa_required.credential).toBe("expire");
    expect(IVA_OUTCOMES.toconline_login_rejected.credential).toBe("invalidate");
    expect(IVA_OUTCOMES.fetched.credential).toBe("verify");
    // Autorização em falta é problema da empresa, não da senha.
    expect(IVA_OUTCOMES.at_authorization_missing.credential).toBeNull();
    expect(IVA_OUTCOMES.company_not_found.credential).toBeNull();
  });

  it("classifica a gravidade de forma utilizável pela interface", () => {
    expect(IVA_OUTCOMES.fetched.severity).toBe("ok");
    expect(IVA_OUTCOMES.document_not_ready.severity).toBe("wait");
    expect(IVA_OUTCOMES.at_credential_missing.severity).toBe("action");
    expect(IVA_OUTCOMES.at_unexpected_page.severity).toBe("support");
  });
});

describe("renderGuidance", () => {
  it("escreve o período por extenso e as datas em dd/mm/aaaa", () => {
    const text = renderGuidance("fetched", { period: "2026-07", dueDate: "2026-09-25" });
    expect(text).toContain("julho de 2026");
    expect(text).toContain("25/09/2026");
  });

  it("traduz a causa da credencial inválida", () => {
    const text = renderGuidance("at_credential_invalid", { invalidReason: "senha_bloqueada" });
    expect(text).toContain(INVALID_REASON_LABELS.senha_bloqueada);
    expect(text).not.toContain("senha_bloqueada");
  });

  it("nunca deixa um marcador por resolver, com ou sem detalhes", () => {
    const full = {
      period: "2026-Q2",
      dueDate: "2026-09-25",
      filingDeadline: "2026-09-21",
      attemptsLeft: 2,
      attempts: 5,
      invalidReason: "login_rejeitado",
    };
    for (const code of IVA_OUTCOME_CODES) {
      expect(renderGuidance(code, {}), code).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(renderGuidance(code, full), code).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  it("um marcador sem valor vira travessão", () => {
    expect(renderGuidance("fetched", {})).toContain("—");
  });

  it("{n} do limite diário sai das tentativas de hoje", () => {
    expect(renderGuidance("daily_cap_reached", { attempts: 5 })).toContain("5 vezes");
  });
});

describe("IVA_STAGES", () => {
  it("é a lista de onde sai o tipo IvaStage — readIvaOutcome reconhece todas", () => {
    expect(IVA_STAGES.length).toBeGreaterThan(0);
    for (const stage of IVA_STAGES) {
      expect(
        readIvaOutcome(job({ status: "succeeded", result: { outcome: "fetched", stage } })),
        stage,
      ).toMatchObject({ details: { stage } });
    }
  });
});

describe("INVALID_REASON_LABELS", () => {
  it("cobre as causas que o worker sabe escrever", () => {
    expect(Object.keys(INVALID_REASON_LABELS).sort()).toEqual([
      "2fa_exigido",
      "decrypt_failed",
      "login_rejeitado",
      "senha_bloqueada",
      "senha_expirada",
      "senha_nao_configurada",
    ]);
  });
});

describe("readIvaOutcome", () => {
  it("succeeded: o desfecho está em result.outcome, com os detalhes do result", () => {
    expect(
      readIvaOutcome(
        job({
          status: "succeeded",
          attempts: 1,
          result: { outcome: "fetched", period: "2026-07", dueDate: "2026-09-25" },
        }),
      ),
    ).toEqual({
      kind: "outcome",
      outcome: "fetched",
      details: { period: "2026-07", dueDate: "2026-09-25" },
    });
  });

  it("skipped: o desfecho está em result.reason", () => {
    expect(
      readIvaOutcome(job({ status: "skipped", result: { reason: "already_fetched" } })),
    ).toMatchObject({ kind: "outcome", outcome: "already_fetched" });
  });

  it("failed: o desfecho está em last_error.outcome", () => {
    expect(
      readIvaOutcome(
        job({
          status: "failed",
          attempts: 1,
          last_error: { outcome: "at_login_rejected", attemptsLeft: 2 },
        }),
      ),
    ).toEqual({
      kind: "outcome",
      outcome: "at_login_rejected",
      details: { attemptsLeft: 2 },
    });
  });

  it("pending e running estão em curso, com o número da tentativa", () => {
    expect(readIvaOutcome(job({ status: "pending", attempts: 0 }))).toEqual({
      kind: "in_flight",
      attempt: 1,
    });
    expect(readIvaOutcome(job({ status: "running", attempts: 2 }))).toEqual({
      kind: "in_flight",
      attempt: 2,
    });
  });

  it("em curso depois de falhar, lembra o último desfecho conhecido", () => {
    expect(
      readIvaOutcome(
        job({ status: "pending", attempts: 1, last_error: { outcome: "at_unavailable" } }),
      ),
    ).toEqual({ kind: "in_flight", attempt: 2, lastOutcome: "at_unavailable" });
  });

  it("adiado pelo gate: volta a pending sem gastar tentativa, em pausa", () => {
    // É assim que a fila guarda um job adiado: status de volta a `pending` e
    // `last_error = { message, deferred: true }` — sem incrementar `attempts`.
    expect(
      readIvaOutcome(
        job({ status: "pending", attempts: 1, last_error: { message: "gate", deferred: true } }),
      ),
    ).toEqual({ kind: "in_flight", attempt: 2, lastOutcome: "portal_paused" });
  });

  it("aceita também um status deferred literal", () => {
    expect(readIvaOutcome(job({ status: "deferred", attempts: 0 }))).toEqual({
      kind: "in_flight",
      attempt: 1,
      lastOutcome: "portal_paused",
    });
    expect(
      readIvaOutcome(job({ status: "deferred", attempts: 2, last_error: { message: "gate" } })),
    ).toEqual({ kind: "in_flight", attempt: 3, lastOutcome: "portal_paused" });
  });

  it("linha antiga sem código reconhecível cai em unknown_error", () => {
    expect(readIvaOutcome(job({ status: "failed", last_error: "boom" }))).toEqual({
      kind: "outcome",
      outcome: "unknown_error",
      details: {},
    });
    expect(readIvaOutcome(job({ status: "succeeded", result: { scanned: 3 } }))).toMatchObject({
      kind: "outcome",
      outcome: "unknown_error",
    });
    expect(
      readIvaOutcome(job({ status: "failed", last_error: { outcome: "codigo_que_nao_existe" } })),
    ).toMatchObject({ kind: "outcome", outcome: "unknown_error" });
  });

  it("é total: não lança com estado desconhecido nem com jsonb estranho", () => {
    expect(readIvaOutcome(job({ status: "cancelled" }))).toMatchObject({ kind: "outcome" });
    expect(readIvaOutcome(job({ status: "succeeded", result: [1, 2, 3] }))).toMatchObject({
      outcome: "unknown_error",
    });
    expect(readIvaOutcome(job({ status: "succeeded", result: null }))).toMatchObject({
      outcome: "unknown_error",
    });
  });

  it("ignora detalhes com o tipo errado em vez de os propagar", () => {
    expect(
      readIvaOutcome(
        job({
          status: "succeeded",
          result: { outcome: "fetched", period: 7, attemptsLeft: "dois", stage: "at_login" },
        }),
      ),
    ).toEqual({ kind: "outcome", outcome: "fetched", details: { stage: "at_login" } });
  });
});

describe("parseIvaDocumentPayload", () => {
  const valid: IvaDocumentJobPayload = {
    teamId: "team-1",
    companyId: "company-1",
    access: "at_direct_login",
    credentialId: "cred-1",
    credentialScope: "team",
  };

  it("lê um payload completo", () => {
    expect(parseIvaDocumentPayload({ ...valid })).toEqual(valid);
    expect(
      parseIvaDocumentPayload({ ...valid, period: "2026-07", force: true, batchId: "batch-1" }),
    ).toEqual({ ...valid, period: "2026-07", force: true, batchId: "batch-1" });
  });

  it("recusa payload incompleto ou com modo de acesso não suportado", () => {
    expect(parseIvaDocumentPayload({ ...valid, teamId: "" })).toBeNull();
    expect(parseIvaDocumentPayload({ ...valid, companyId: undefined })).toBeNull();
    expect(parseIvaDocumentPayload({ ...valid, credentialId: null })).toBeNull();
    expect(parseIvaDocumentPayload({ ...valid, access: "cartao_cidadao" })).toBeNull();
    expect(parseIvaDocumentPayload({ ...valid, credentialScope: "global" })).toBeNull();
    expect(parseIvaDocumentPayload(null)).toBeNull();
    expect(parseIvaDocumentPayload("rpa.fetch_iva_document")).toBeNull();
    expect(parseIvaDocumentPayload([])).toBeNull();
  });

  it("ignora os campos opcionais mal formados em vez de recusar o job", () => {
    expect(parseIvaDocumentPayload({ ...valid, period: 202607, force: "sim", batchId: 3 })).toEqual(
      valid,
    );
  });
});
