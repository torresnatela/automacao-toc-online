import { describe, it, expect, vi } from "vitest";
import { AT_ACCESS_MODES, IVA_OUTCOME_CODES, type AtAccessMode } from "@toc/core/domain";
import {
  ACCESS_LABEL,
  BULK_COPY,
  CREDENTIAL_OUTCOME_TARGET,
  NOT_READY_BULK_COPY,
  NOT_READY_COPY,
  accessHint,
  batchProgress,
  credentialBanner,
  credentialLinkFor,
  deriveState,
  fetchAffordance,
  fetchAffordances,
  fetchButtonLabel,
  formatDatePt,
  formatEur,
  formatNotReadyReasons,
  isPeakDay,
  jobErrorFor,
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
    job_deferred: false,
    job_access: null,
    ...over,
  };
}

/** Um job existe: `job_id`/`job_status` andam sempre juntos na view. */
function withJob(over: Partial<IvaDocumentRow>): IvaDocumentRow {
  return row({ job_id: "44444444-4444-4444-4444-444444444444", ...over });
}

const activeCredential = { hasSecret: true, status: "active" };
const ROTA_A: AtAccessMode = "toconline_direct_access";
const ROTA_B: AtAccessMode = "at_direct_login";
/** As duas rotas com a credencial que cada uma quer, já resolvida e ativa. */
const prontaEm = (access: AtAccessMode) => ({ access, credential: activeCredential });

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

describe("deriveState × adiamento", () => {
  it("pending adiado é «Portal em pausa», não «Na fila»", () => {
    // O adiamento devolve o job à fila sem gastar tentativa: sem esta coluna, uma
    // indisponibilidade da AT aparecia como 182 empresas eternamente na fila.
    const derived = deriveState(withJob({ job_status: "pending", job_deferred: true }));

    expect(derived.state).toBe("portal_paused");
    expect(derived.outcome).toBe("portal_paused");
  });

  it("pending sem adiamento continua «Na fila»", () => {
    const derived = deriveState(withJob({ job_status: "pending", job_deferred: false }));

    expect(derived.state).toBe("queued");
    expect(derived.outcome).toBeNull();
  });

  it("um job adiado continua em curso — nenhum botão convida a um segundo pedido", () => {
    const adiada = withJob({ job_status: "pending", job_deferred: true });
    const view = presentIvaRow(adiada);

    expect(view.inFlight).toBe(true);
    expect(view.label).toBe("Portal em pausa");
    // A orientação vem do domínio, não de um texto inventado aqui.
    expect(view.guidance).toBe(
      "O sistema pausou o acesso à AT por indisponibilidade; retoma sozinho.",
    );
    for (const access of AT_ACCESS_MODES) {
      expect(fetchAffordance(adiada, prontaEm(access)).canFetch, access).toBe(false);
    }
  });
});

describe("jobErrorFor", () => {
  it("mostra o erro do job falhado", () => {
    expect(
      jobErrorFor(
        withJob({
          job_status: "failed",
          job_outcome: "at_unavailable",
          job_error: "Portal em baixo.",
        }),
      ),
    ).toBe("Portal em baixo.");
  });

  it("cala o erro de uma tentativa anterior quando a linha já não é uma falha", () => {
    // `last_error` fica na linha do job depois de um `defer`, e a fila não o
    // limpava ao concluir: a guia aparecia com o selo verde e, por baixo, o
    // erro da tentativa que não vingou.
    for (const status of ["succeeded", "skipped", "pending", "running"]) {
      expect(
        jobErrorFor(withJob({ job_status: status, job_error: "Portal em baixo." })),
      ).toBeNull();
    }
  });

  it("sem erro nenhum devolve null", () => {
    expect(jobErrorFor(withJob({ job_status: "failed", job_error: null }))).toBeNull();
  });
});

// A linha do ecrã que NÃO depende da rota: estado, crachá, orientação, em curso.
describe("presentIvaRow", () => {
  it("uma empresa por buscar", () => {
    const view = presentIvaRow(row());
    expect(view.state).toBe("never");
    expect(view.inFlight).toBe(false);
    expect(view.outcome).toBeNull();
    expect(view.lastAccess).toBeNull();
  });

  it("uma busca a correr está em curso", () => {
    expect(presentIvaRow(withJob({ job_status: "running" })).inFlight).toBe(true);
    expect(presentIvaRow(withJob({ job_status: "pending" })).inFlight).toBe(true);
  });

  it("a orientação vem do domínio, com o período e o prazo por extenso", () => {
    const view = presentIvaRow(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_period: "2026-07" }),
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
    expect(presentIvaRow(row()).guidance).toBe("Clique em Buscar");
    expect(presentIvaRow(withJob({ job_status: "pending" })).guidance).toBe("Aguarda o worker");
  });
});

describe("presentIvaRow × envio ao cliente (mock)", () => {
  const guiaObtida = (over: Partial<IvaDocumentRow> = {}) =>
    withJob({
      job_status: "succeeded",
      job_outcome: "fetched",
      job_period: "2026-07",
      document_id: "44444444-4444-4444-4444-444444444444",
      document_status: "extracted",
      has_file: true,
      ...over,
    });

  it("uma guia capturada e com ficheiro pode ser enviada ao cliente", () => {
    const view = presentIvaRow(guiaObtida());
    expect(view.canSend).toBe(true);
    expect(view.sent).toBe(false);
  });

  it("uma guia já enviada não se envia outra vez e mostra-se como enviada", () => {
    const view = presentIvaRow(guiaObtida({ document_status: "sent" }));
    expect(view.sent).toBe(true);
    expect(view.canSend).toBe(false);
  });

  it("sem ficheiro (ou sem documento) não há nada a enviar", () => {
    expect(presentIvaRow(guiaObtida({ has_file: false })).canSend).toBe(false);
    expect(presentIvaRow(row()).canSend).toBe(false);
    expect(presentIvaRow(row()).sent).toBe(false);
  });
});

describe("presentIvaRow × rota da última tentativa", () => {
  it("lê de `job_access` por que rota correu o último job", () => {
    const view = presentIvaRow(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_access: ROTA_A }),
    );
    expect(view.lastAccess).toBe(ROTA_A);
    expect(view.details.access).toBe(ROTA_A);
  });

  it("sem rota gravada (job anterior à coluna) não inventa nenhuma", () => {
    const view = presentIvaRow(withJob({ job_status: "succeeded", job_outcome: "fetched" }));
    expect(view.lastAccess).toBeNull();
    expect(view.details).not.toHaveProperty("access");
  });

  it("uma rota que este build não conhece é o mesmo que nenhuma", () => {
    const view = presentIvaRow(
      withJob({ job_status: "succeeded", job_outcome: "fetched", job_access: "rota_do_futuro" }),
    );
    expect(view.lastAccess).toBeNull();
  });
});

// A decisão que DEPENDE da rota: cada botão sabe se pode buscar e porquê.
describe("fetchAffordance", () => {
  it("uma empresa pronta pode buscar pelas duas rotas", () => {
    for (const access of AT_ACCESS_MODES) {
      const a = fetchAffordance(row(), prontaEm(access));
      expect(a.access).toBe(access);
      expect(a.readiness).toEqual({ ready: true });
      expect(a.canFetch).toBe(true);
      expect(a.disabledReason).toBeUndefined();
      expect(a.refetch).toBe(false);
    }
  });

  it("uma busca em curso desliga as duas rotas", () => {
    const aCorrer = withJob({ job_status: "running" });
    for (const access of AT_ACCESS_MODES) {
      const a = fetchAffordance(aCorrer, prontaEm(access));
      expect(a.canFetch, access).toBe(false);
      expect(a.disabledReason, access).toBe("Busca já em curso.");
    }
  });

  it("sem credencial da AT só a rota B se desliga", () => {
    // A credencial entra já resolvida POR rota: a da AT em falta não diz nada
    // sobre a ligação ao TOConline, que pode estar perfeitamente configurada.
    const b = fetchAffordance(row(), { access: ROTA_B, credential: null });
    expect(b.canFetch).toBe(false);
    expect(b.readiness).toEqual({ ready: false, reason: "credential_missing" });
    expect(b.disabledReason).toBe("Configure o acesso à AT.");

    expect(fetchAffordance(row(), prontaEm(ROTA_A)).canFetch).toBe(true);
  });

  it("sem ligação ao TOConline só a rota A se desliga", () => {
    const semLigacao = row({ toconline_company_id: null });
    const a = fetchAffordance(semLigacao, prontaEm(ROTA_A));
    expect(a.canFetch).toBe(false);
    expect(a.readiness).toEqual({ ready: false, reason: "company_not_linked" });
    expect(a.disabledReason).toBe("Sem ligação ao TOConline — corra a varredura.");

    // Na rota B a empresa sem ligação busca-se na mesma, pelo NIF.
    expect(fetchAffordance(semLigacao, prontaEm(ROTA_B)).canFetch).toBe(true);
  });

  it("sem NIF só a rota B se desliga", () => {
    const semNif = row({ nif: null });
    const b = fetchAffordance(semNif, prontaEm(ROTA_B));
    expect(b.canFetch).toBe(false);
    expect(b.readiness).toEqual({ ready: false, reason: "nif_missing" });
    expect(b.disabledReason).toBe("Empresa sem NIF.");

    // Na rota A quem identifica a empresa no portal é o TOConline.
    expect(fetchAffordance(semNif, prontaEm(ROTA_A)).canFetch).toBe(true);
  });

  it("na rota A a cópia da credencial fala do TOConline", () => {
    expect(fetchAffordance(row(), { access: ROTA_A, credential: null }).disabledReason).toBe(
      "Configure a ligação ao TOConline.",
    );
    expect(
      fetchAffordance(row(), { access: ROTA_A, credential: { hasSecret: true, status: "invalid" } })
        .disabledReason,
    ).toBe("Ligação ao TOConline inválida — atualize a palavra-passe.");
  });

  it("uma empresa inativa não se busca, seja qual for a rota", () => {
    const inativa = row({ company_status: "inactive" });
    for (const access of AT_ACCESS_MODES) {
      const a = fetchAffordance(inativa, prontaEm(access));
      expect(a.canFetch, access).toBe(false);
      expect(a.disabledReason, access).toBe("Empresa inativa.");
    }
  });

  it("o nome do botão diz o verbo e a rota", () => {
    expect(fetchButtonLabel(ROTA_B, false)).toBe("Buscar");
    expect(fetchButtonLabel(ROTA_B, true)).toBe("Buscar novamente");
    expect(fetchButtonLabel(ROTA_A, false)).toBe("Buscar via TOConline");
    expect(fetchButtonLabel(ROTA_A, true)).toBe("Buscar novamente via TOConline");
  });

  it("«novamente» (e a re-busca forçada) só depois de um job terminal", () => {
    // `refetch` é explícito, e não deduzido do rótulo: é ele que decide se o
    // formulário força a re-busca, e um rótulo novo não o pode desligar em
    // silêncio.
    const nunca = fetchAffordance(row(), prontaEm(ROTA_B));
    expect(nunca.refetch).toBe(false);
    expect(nunca.label).toBe("Buscar");

    for (const status of ["pending", "running"]) {
      const emCurso = fetchAffordance(withJob({ job_status: status }), prontaEm(ROTA_B));
      expect(emCurso.refetch, status).toBe(false);
      expect(emCurso.label, status).toBe("Buscar");
    }

    const obtida = withJob({ job_status: "succeeded", job_outcome: "fetched" });
    expect(fetchAffordance(obtida, prontaEm(ROTA_B))).toMatchObject({
      refetch: true,
      label: "Buscar novamente",
    });
    expect(fetchAffordance(obtida, prontaEm(ROTA_A))).toMatchObject({
      refetch: true,
      label: "Buscar novamente via TOConline",
    });
    expect(
      fetchAffordance(withJob({ job_status: "failed", job_outcome: null }), prontaEm(ROTA_B))
        .refetch,
    ).toBe(true);
  });
});

describe("fetchAffordances", () => {
  it("dá uma decisão por rota — as duas, sempre, cada uma com a sua credencial", () => {
    const credentialFor = vi.fn((access: AtAccessMode) =>
      access === ROTA_B ? null : activeCredential,
    );
    const all = fetchAffordances(row(), credentialFor);

    expect(Object.keys(all).sort()).toEqual([...AT_ACCESS_MODES].sort());
    expect(credentialFor).toHaveBeenCalledTimes(AT_ACCESS_MODES.length);
    for (const access of AT_ACCESS_MODES) expect(credentialFor).toHaveBeenCalledWith(access);

    // A credencial da AT em falta desliga o «Buscar» e deixa o «Buscar via
    // TOConline» ligado — cada botão responde pela sua rota.
    expect(all.at_direct_login.canFetch).toBe(false);
    expect(all.at_direct_login.disabledReason).toBe("Configure o acesso à AT.");
    expect(all.toconline_direct_access.canFetch).toBe(true);
  });
});

describe("accessHint", () => {
  it("diz por que rota correu a última tentativa, em PT-PT", () => {
    expect(accessHint(ROTA_A)).toBe("via TOConline");
    expect(accessHint(ROTA_B)).toBe("login direto na AT");
    expect(accessHint(null)).toBeNull();
  });

  it("tem um rótulo para cada rota do domínio", () => {
    expect(Object.keys(ACCESS_LABEL).sort()).toEqual([...AT_ACCESS_MODES].sort());
    for (const access of AT_ACCESS_MODES) expect(accessHint(access)).toBe(ACCESS_LABEL[access]);
  });
});

describe("BULK_COPY", () => {
  it("o lote de cada rota tem um botão com nome próprio — e a rota B mantém o dela", () => {
    expect(Object.keys(BULK_COPY).sort()).toEqual([...AT_ACCESS_MODES].sort());
    expect(BULK_COPY.at_direct_login.button).toBe("Buscar todas");
    expect(BULK_COPY.toconline_direct_access.button).toBe("Buscar todas via TOConline");
    expect(BULK_COPY.toconline_direct_access.title).not.toBe(BULK_COPY.at_direct_login.title);
    expect(BULK_COPY.toconline_direct_access.title).toContain("via TOConline");
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
  // O Intl usa espaço não separável (U+00A0 ou U+202F, consoante o ICU) antes
  // do símbolo; `\s` apanha os dois, e normalizamos para comparar sem depender
  // do byte exato.
  const plain = (value: string) => value.replace(/\s/g, " ");

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
    expect(
      credentialBanner("at_direct_login", { hasSecret: false, status: "active" })?.message,
    ).toBe("Configure o acesso à AT antes de buscar guias.");
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
  it("os desfechos da senha da AT levam ao ecrã da rota que correu", () => {
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

  it("sem rota conhecida os desfechos da senha da AT levam ao ecrã da AT", () => {
    // Jobs anteriores à coluna `job_access`: a rota B era a única que corria.
    expect(credentialLinkFor("at_login_rejected", null)?.href).toBe("/integracoes/at");
    expect(credentialLinkFor("at_credential_missing", null)?.href).toBe("/integracoes/at");
  });

  it("os desfechos do TOConline levam sempre ao TOConline", () => {
    expect(credentialLinkFor("toconline_login_rejected", "at_direct_login")?.href).toBe(
      "/integracoes/toconline",
    );
    expect(credentialLinkFor("direct_access_not_configured", "at_direct_login")?.href).toBe(
      "/integracoes/toconline",
    );
    expect(credentialLinkFor("toconline_credential_missing", null)?.href).toBe(
      "/integracoes/toconline",
    );
  });

  // A rede do `Record` total é de compilação; esta é a de execução, para o caso
  // de o código novo chegar a um build já compilado (a mesma disciplina de
  // `outcomes.test.ts`).
  it("decide sobre TODOS os desfechos do domínio — nenhum cai em silêncio", () => {
    expect(Object.keys(CREDENTIAL_OUTCOME_TARGET).sort()).toEqual([...IVA_OUTCOME_CODES].sort());
  });

  it("um desfecho que não é de credencial não sugere ecrã nenhum", () => {
    expect(credentialLinkFor("document_not_ready", "at_direct_login")).toBeNull();
    expect(credentialLinkFor(null, "at_direct_login")).toBeNull();
    expect(credentialLinkFor(null, null)).toBeNull();
  });
});
