import { describe, it, expect } from "vitest";
import {
  NOT_READY_BULK_COPY,
  NOT_READY_COPY,
  batchProgress,
  credentialBanner,
  credentialLinkFor,
  deriveState,
  formatDatePt,
  formatEur,
  formatNotReadyReasons,
  isPeakDay,
  notReadyCopy,
  presentIvaRow,
  type IvaDocumentRow,
} from "@/lib/documents/present";

/** Uma linha da view com tudo preenchido e nenhum job — o caso "por buscar". */
function row(over: Partial<IvaDocumentRow> = {}): IvaDocumentRow {
  return {
    company_id: "11111111-1111-1111-1111-111111111111",
    team_id: "22222222-2222-2222-2222-222222222222",
    company_name: "Padaria Central, Lda.",
    nif: "501442600",
    company_status: "active",
    toconline_company_id: 4242,
    toconline_cluster: 3,
    period_id: "33333333-3333-3333-3333-333333333333",
    period: "2026-07",
    period_status: "pending",
    due_date: "2026-09-25",
    document_id: null,
    entity: null,
    reference: null,
    amount: null,
    valid_until: null,
    document_status: null,
    has_file: false,
    extracted_at: null,
    job_id: null,
    job_status: null,
    job_outcome: null,
    job_period: null,
    job_batch_id: null,
    job_error: null,
    job_trace_id: null,
    job_attempts: null,
    job_created_at: null,
    job_finished_at: null,
    ...over,
  };
}

/** Um job existe: `job_id`/`job_status` andam sempre juntos na view. */
function withJob(over: Partial<IvaDocumentRow>): IvaDocumentRow {
  return row({ job_id: "44444444-4444-4444-4444-444444444444", ...over });
}

const activeCredential = { hasSecret: true, status: "active" };
const NOW = new Date("2026-09-10T10:00:00Z");

describe("deriveState", () => {
  it("lê `pending` como fila e `running` como execução", () => {
    expect(deriveState(withJob({ job_status: "pending" })).state).toBe("queued");
    expect(deriveState(withJob({ job_status: "running" })).state).toBe("running");
  });

  it("sem job nenhum, a guia nunca foi buscada", () => {
    const derived = deriveState(row());
    expect(derived.state).toBe("never");
    expect(derived.outcome).toBeNull();
  });

  it("lê o desfecho de um job concluído", () => {
    const derived = deriveState(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_period: "2026-07" }),
    );
    expect(derived.state).toBe("fetched");
    expect(derived.outcome).toBe("fetched");
    expect(derived.details).toEqual({ period: "2026-07", dueDate: "2026-09-25" });
  });

  it("lê o desfecho de um job saltado", () => {
    const derived = deriveState(
      withJob({ job_status: "skipped", job_outcome: "no_payment_document" }),
    );
    expect(derived.state).toBe("no_payment_document");
    expect(derived.outcome).toBe("no_payment_document");
  });

  it("lê o desfecho de um job falhado", () => {
    const derived = deriveState(
      withJob({ job_status: "failed", job_outcome: "at_login_rejected" }),
    );
    expect(derived.state).toBe("at_login_rejected");
    expect(derived.outcome).toBe("at_login_rejected");
  });

  // Duas formas da mesma linha antiga: a falha sem código e o código que este
  // build não conhece. Nenhuma pode rebentar a listagem.
  it("um job falhado sem desfecho é `failed_unknown`", () => {
    const derived = deriveState(withJob({ job_status: "failed", job_outcome: null }));
    expect(derived.state).toBe("failed_unknown");
    expect(derived.outcome).toBeNull();
  });

  it("um desfecho desconhecido é `failed_unknown`", () => {
    const derived = deriveState(
      withJob({ job_status: "succeeded", job_outcome: "algo_que_nao_existe" }),
    );
    expect(derived.state).toBe("failed_unknown");
    expect(derived.outcome).toBeNull();
  });

  it("o período do job manda sobre o do período da obrigação", () => {
    const derived = deriveState(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_period: "2026-Q2" }),
    );
    expect(derived.details.period).toBe("2026-Q2");
  });
});

describe("presentIvaRow", () => {
  const ctxB = { access: "at_direct_login" as const, credential: activeCredential, now: NOW };

  it("uma empresa pronta pode buscar", () => {
    const view = presentIvaRow(row(), ctxB);
    expect(view.state).toBe("never");
    expect(view.canFetch).toBe(true);
    expect(view.disabledReason).toBeUndefined();
    expect(view.fetchLabel).toBe("Buscar");
    expect(view.inFlight).toBe(false);
  });

  it("não deixa buscar com uma busca em curso", () => {
    const view = presentIvaRow(withJob({ job_status: "running" }), ctxB);
    expect(view.inFlight).toBe(true);
    expect(view.canFetch).toBe(false);
    expect(view.disabledReason).toBe("Busca já em curso.");
  });

  it("não deixa buscar sem credencial da AT (rota B)", () => {
    const view = presentIvaRow(row(), { ...ctxB, credential: null });
    expect(view.canFetch).toBe(false);
    expect(view.readiness).toEqual({ ready: false, reason: "credential_missing" });
    expect(view.disabledReason).toBe("Configure o acesso à AT.");
  });

  it("não deixa buscar sem NIF na rota B", () => {
    const view = presentIvaRow(row({ nif: null }), ctxB);
    expect(view.canFetch).toBe(false);
    expect(view.readiness).toEqual({ ready: false, reason: "nif_missing" });
    expect(view.disabledReason).toBe("Empresa sem NIF.");
  });

  it("na rota A a cópia da credencial fala do TOConline", () => {
    const ctxA = { access: "toconline_direct_access" as const, credential: null, now: NOW };
    expect(presentIvaRow(row(), ctxA).disabledReason).toBe("Configure a ligação ao TOConline.");
    expect(
      presentIvaRow(row(), { ...ctxA, credential: { hasSecret: true, status: "invalid" } })
        .disabledReason,
    ).toBe("Ligação ao TOConline inválida — atualize a palavra-passe.");
  });

  it("«Buscar novamente» só depois de um job terminal", () => {
    expect(presentIvaRow(row(), ctxB).fetchLabel).toBe("Buscar");
    expect(presentIvaRow(withJob({ job_status: "pending" }), ctxB).fetchLabel).toBe("Buscar");
    expect(presentIvaRow(withJob({ job_status: "running" }), ctxB).fetchLabel).toBe("Buscar");
    expect(
      presentIvaRow(withJob({ job_status: "succeeded", job_outcome: "fetched" }), ctxB).fetchLabel,
    ).toBe("Buscar novamente");
    expect(
      presentIvaRow(withJob({ job_status: "failed", job_outcome: null }), ctxB).fetchLabel,
    ).toBe("Buscar novamente");
  });

  it("a orientação vem do domínio, com o período e o prazo por extenso", () => {
    const view = presentIvaRow(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_period: "2026-07" }),
      ctxB,
    );
    expect(view.label).toBe("Guia obtida");
    expect(view.tone).toBe("success");
    expect(view.guidance).toBe(
      "Guia de julho de 2026 guardada. Envie-a ao cliente: pagamento até 25/09/2026.",
    );
    // Nenhuma orientação sai com um marcador por resolver.
    expect(view.guidance).not.toMatch(/\{\w+\}/);
    expect(view.outcome).toBe("fetched");
  });

  it("os estados de UI usam a linha curta como orientação", () => {
    expect(presentIvaRow(row(), ctxB).guidance).toBe("Clique em Buscar");
    expect(presentIvaRow(withJob({ job_status: "pending" }), ctxB).guidance).toBe(
      "Aguarda o worker",
    );
  });

  it("uma empresa inativa não se busca, seja qual for a rota", () => {
    const view = presentIvaRow(row({ company_status: "inactive" }), ctxB);
    expect(view.canFetch).toBe(false);
    expect(view.disabledReason).toBe("Empresa inativa.");
  });

  it("na rota A a empresa sem ligação ao TOConline não se busca", () => {
    const view = presentIvaRow(row({ toconline_company_id: null }), {
      access: "toconline_direct_access",
      credential: activeCredential,
      now: NOW,
    });
    expect(view.canFetch).toBe(false);
    expect(view.disabledReason).toBe("Sem ligação ao TOConline — corra a varredura.");
  });
});

describe("notReadyCopy", () => {
  it("tem uma cópia para cada motivo", () => {
    for (const [reason, copy] of Object.entries(NOT_READY_COPY)) {
      expect(copy.trim(), reason).not.toBe("");
    }
  });

  it("só a credencial muda de texto entre rotas", () => {
    expect(notReadyCopy("company_inactive", "toconline_direct_access")).toBe(
      notReadyCopy("company_inactive", "at_direct_login"),
    );
    expect(notReadyCopy("credential_missing", "at_direct_login")).toBe("Configure o acesso à AT.");
    expect(notReadyCopy("credential_invalid", "at_direct_login")).toBe(
      "Acesso à AT inválido — atualize a palavra-passe.",
    );
  });
});

describe("isPeakDay", () => {
  // Os dias 20–25 são o pico de entregas: a AT responde mal e o «buscar todas»
  // avisa antes de enfileirar dezenas de jobs.
  it("é o intervalo fechado 20–25", () => {
    expect(isPeakDay(new Date(2026, 8, 19, 12))).toBe(false);
    expect(isPeakDay(new Date(2026, 8, 20, 12))).toBe(true);
    expect(isPeakDay(new Date(2026, 8, 25, 12))).toBe(true);
    expect(isPeakDay(new Date(2026, 8, 26, 12))).toBe(false);
  });
});

describe("formatEur", () => {
  // O Intl usa espaço não separável antes do símbolo; normalizamos para
  // comparar sem depender do byte exato.
  const plain = (value: string) => value.replace(/[  ]/g, " ");

  it("formata em euros à portuguesa", () => {
    expect(plain(formatEur("1234.56"))).toBe("1234,56 €");
    expect(plain(formatEur(1234.56))).toBe("1234,56 €");
    expect(plain(formatEur(0))).toBe("0,00 €");
  });

  it("sem valor mostra travessão", () => {
    expect(formatEur(null)).toBe("—");
    expect(formatEur("nada disto é um número")).toBe("—");
  });
});

describe("formatDatePt", () => {
  it("põe a data ISO em dd/mm/aaaa", () => {
    expect(formatDatePt("2026-09-25")).toBe("25/09/2026");
    expect(formatDatePt("2026-09-25T10:00:00.000Z")).toBe("25/09/2026");
  });

  it("sem data mostra travessão", () => {
    expect(formatDatePt(null)).toBe("—");
    expect(formatDatePt("")).toBe("—");
  });
});

describe("formatNotReadyReasons", () => {
  it("junta os motivos com empresas, na ordem em que se resolvem", () => {
    expect(
      formatNotReadyReasons({ nif_missing: 3, credential_missing: 2, company_inactive: 1 }),
    ).toBe("1 inativas, 2 sem credencial, 3 sem NIF");
  });

  it("ignora motivos a zero e devolve vazio quando não há nenhum", () => {
    expect(formatNotReadyReasons({ nif_missing: 0 })).toBe("");
    expect(formatNotReadyReasons({})).toBe("");
  });

  it("tem um sintagma para cada motivo", () => {
    for (const [reason, copy] of Object.entries(NOT_READY_BULK_COPY)) {
      expect(copy.trim(), reason).not.toBe("");
    }
  });
});

describe("batchProgress", () => {
  const LOTE = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const ANTIGO = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  /** Uma linha de lote: empresa distinta (a view dá uma linha por empresa). */
  function loteRow(company: string, over: Partial<IvaDocumentRow>): IvaDocumentRow {
    return withJob({
      company_id: company,
      job_batch_id: LOTE,
      job_created_at: "2026-09-10T09:00:00Z",
      ...over,
    });
  }

  it("sem nenhuma linha em curso não há lote a mostrar", () => {
    expect(batchProgress([row()])).toBeNull();
    expect(
      batchProgress([loteRow("a", { job_status: "succeeded", job_outcome: "fetched" })]),
    ).toBeNull();
  });

  it("conta a fila, a execução, as concluídas e as que precisam de atenção", () => {
    const progress = batchProgress([
      loteRow("a", { job_status: "pending" }),
      loteRow("b", { job_status: "running" }),
      loteRow("c", { job_status: "succeeded", job_outcome: "fetched" }),
      loteRow("d", { job_status: "skipped", job_outcome: "already_paid" }),
      loteRow("e", { job_status: "failed", job_outcome: "at_login_rejected" }),
      loteRow("f", { job_status: "failed", job_outcome: "at_unexpected_page" }),
    ]);

    expect(progress).toEqual({ batchId: LOTE, queued: 1, running: 1, done: 2, attention: 2 });
  });

  it("«aguardar» não é conclusão nem atenção — o sistema ainda vai tentar", () => {
    const progress = batchProgress([
      loteRow("a", { job_status: "pending" }),
      loteRow("b", { job_status: "failed", job_outcome: "at_unavailable" }),
    ]);
    expect(progress).toEqual({ batchId: LOTE, queued: 1, running: 0, done: 0, attention: 0 });
  });

  it("um desfecho que este build não conhece pede atenção, não silêncio", () => {
    const progress = batchProgress([
      loteRow("a", { job_status: "running" }),
      loteRow("b", { job_status: "failed", job_outcome: "codigo_do_futuro" }),
    ]);
    expect(progress?.attention).toBe(1);
  });

  it("agrupa pelo lote mais recente e ignora as linhas dos outros", () => {
    const progress = batchProgress([
      withJob({
        company_id: "velha",
        job_batch_id: ANTIGO,
        job_status: "pending",
        job_created_at: "2026-09-09T09:00:00Z",
      }),
      loteRow("a", { job_status: "pending", job_created_at: "2026-09-10T09:00:00Z" }),
      loteRow("b", { job_status: "succeeded", job_outcome: "fetched" }),
    ]);

    expect(progress).toEqual({ batchId: LOTE, queued: 1, running: 0, done: 1, attention: 0 });
  });

  it("uma busca avulsa (sem lote) em curso não inventa um lote", () => {
    expect(batchProgress([withJob({ job_status: "pending" })])).toBeNull();
  });
});

describe("credentialBanner", () => {
  it("sem credencial manda configurar a AT na rota B", () => {
    expect(credentialBanner("at_direct_login", null)).toEqual({
      message: "Configure o acesso à AT antes de buscar guias.",
      href: "/integracoes/at",
      linkLabel: "Configurar acesso à AT",
    });
  });

  it("um marcador sem segredo continua «por configurar»", () => {
    expect(credentialBanner("at_direct_login", { hasSecret: false, status: "active" })?.message).toBe(
      "Configure o acesso à AT antes de buscar guias.",
    );
  });

  it("credencial marcada diz o estado por extenso e pede senha nova", () => {
    expect(credentialBanner("at_direct_login", { hasSecret: true, status: "invalid" })).toEqual({
      message: "O acesso à AT está marcado como inválida — guarde uma palavra-passe nova.",
      href: "/integracoes/at",
      linkLabel: "Configurar acesso à AT",
    });
  });

  it("na rota A o texto e o link são os do TOConline", () => {
    expect(credentialBanner("toconline_direct_access", null)).toEqual({
      message: "Configure a ligação ao TOConline antes de buscar guias.",
      href: "/integracoes/toconline",
      linkLabel: "Configurar ligação ao TOConline",
    });
    expect(
      credentialBanner("toconline_direct_access", { hasSecret: true, status: "expired" })?.message,
    ).toBe("A ligação ao TOConline está marcada como expirada — guarde uma palavra-passe nova.");
  });

  it("credencial ativa não mostra banner nenhum", () => {
    expect(credentialBanner("at_direct_login", { hasSecret: true, status: "active" })).toBeNull();
  });
});

describe("credentialLinkFor", () => {
  it("os desfechos da senha da AT levam ao ecrã da rota", () => {
    expect(credentialLinkFor("at_login_rejected", "at_direct_login")).toEqual({
      href: "/integracoes/at",
      label: "Configurar acesso à AT",
    });
    // Na rota A a senha da AT vive no TOConline — mandar ao ecrã da AT custaria
    // uma volta inteira ao operador.
    expect(credentialLinkFor("at_password_blocked", "toconline_direct_access")?.href).toBe(
      "/integracoes/toconline",
    );
  });

  it("os desfechos do TOConline levam sempre ao TOConline", () => {
    expect(credentialLinkFor("toconline_login_rejected", "at_direct_login")?.href).toBe(
      "/integracoes/toconline",
    );
    expect(credentialLinkFor("direct_access_not_configured", "at_direct_login")?.href).toBe(
      "/integracoes/toconline",
    );
  });

  it("um desfecho que não é de credencial não sugere ecrã nenhum", () => {
    expect(credentialLinkFor("document_not_ready", "at_direct_login")).toBeNull();
    expect(credentialLinkFor(null, "at_direct_login")).toBeNull();
  });
});
