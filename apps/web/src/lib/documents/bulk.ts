import {
  CREDENTIAL_STATUSES,
  INTEGRATION_PROVIDERS,
  ivaFetchReadiness,
  planBulkFetch,
  type AtAccessMode,
  type BulkRow,
  type CredentialCandidate,
  type CredentialStatus,
  type IntegrationProvider,
  type IvaNotReadyReason,
  type IvaOutcome,
} from "@toc/core/domain";

/**
 * Adaptadores puros entre a base de dados e as decisões de domínio do «buscar».
 *
 * Vivem fora de `service.ts` por um motivo prático: o serviço importa
 * `server-only` e o cliente Supabase, e nada disso arranca sob o Vitest. Aqui
 * está o que vale a pena testar sem levantar a aplicação — a tradução das
 * linhas, a concordância entre prontidão e escolha de credencial, e a soma das
 * contagens de um lote. O serviço fica com o que é mesmo I/O.
 */

/** Linha de `integration_credentials` tal como o cliente admin a devolve. */
export interface CredentialRow {
  id: string;
  provider: string;
  company_id: string | null;
  status: string;
  secret_encrypted: string | null;
  metadata: Record<string, unknown> | null;
}

function knownProvider(value: string): IntegrationProvider | null {
  return INTEGRATION_PROVIDERS.find((p) => p === value) ?? null;
}

function knownStatus(value: string): CredentialStatus | null {
  return CREDENTIAL_STATUSES.find((s) => s === value) ?? null;
}

/**
 * Linhas da BD → candidatos do domínio.
 *
 * Um provider ou estado que este build não conhece é **descartado**, não
 * adivinhado: um candidato com um estado inventado passaria pelo `status !==
 * "active"` de `selectAccessCredential` e bloquearia a rota por engano.
 *
 * O que não é descartado é a linha sem segredo — o *marcador* que o worker
 * escreve quando o portal recusa a senha. É precisamente ele que tem de chegar
 * ao domínio, porque é ele que impede a próxima tentativa.
 */
export function toCredentialCandidates(rows: readonly CredentialRow[]): CredentialCandidate[] {
  const out: CredentialCandidate[] = [];
  for (const row of rows) {
    const provider = knownProvider(row.provider);
    const status = knownStatus(row.status);
    if (provider === null || status === null) continue;

    const candidate: CredentialCandidate = {
      id: row.id,
      provider,
      companyId: row.company_id,
      status,
      hasSecret: row.secret_encrypted !== null,
    };
    const reason = row.metadata?.invalidReason;
    if (typeof reason === "string") candidate.invalidReason = reason;
    out.push(candidate);
  }
  return out;
}

/**
 * A credencial que `ivaFetchReadiness` tem de ver — a mesma que
 * `selectAccessCredential` vai escolher.
 *
 * A ordem de procura é copiada de lá de propósito (marcador da empresa →
 * credencial da empresa → credencial da equipa, ou a do TOConline na rota A):
 * se as duas divergissem, o botão diria «pronta» e o serviço recusaria logo a
 * seguir, ou o «buscar todas» encheria a fila de jobs condenados.
 *
 * O marcador é o caso subtil. Ele não tem segredo, e `ivaFetchReadiness` testa
 * a ausência de segredo **antes** do estado — dizer a verdade («não tem
 * segredo») faria a interface pedir «configure o acesso à AT» quando o que o
 * operador tem de fazer é corrigir a palavra-passe. Por isso o que sai daqui é
 * o que o marcador **significa**: existe uma senha, e o portal recusou-a.
 */
export function credentialForReadiness(
  access: AtAccessMode,
  companyId: string,
  candidates: readonly CredentialCandidate[],
): { hasSecret: boolean; status: string } | null {
  const blocked = candidates.find(
    (c) => c.provider === "at" && c.companyId === companyId && c.status !== "active",
  );
  if (blocked !== undefined) return { hasSecret: true, status: blocked.status };

  const chosen =
    access === "toconline_direct_access"
      ? candidates.find((c) => c.provider === "toconline" && c.companyId === null)
      : (candidates.find((c) => c.provider === "at" && c.companyId === companyId) ??
        candidates.find((c) => c.provider === "at" && c.companyId === null));

  if (chosen === undefined) return null;
  return { hasSecret: chosen.hasSecret, status: chosen.status };
}

/** As colunas de `companies` de que a prontidão precisa, e mais nenhuma. */
export interface BulkCompany {
  id: string;
  status: string;
  nif: string | null;
  toconline_company_id: number | null;
  toconline_cluster: number | null;
}

/** O último job terminal desta empresa, já lido da listagem. */
export interface LastFetch {
  outcome: IvaOutcome | null;
  finishedAt: string | null;
}

/** Empresas + credenciais + jobs em curso → as linhas que `planBulkFetch` reparte. */
export function buildBulkRows(input: {
  access: AtAccessMode;
  companies: readonly BulkCompany[];
  candidates: readonly CredentialCandidate[];
  inFlight: ReadonlySet<string>;
  lastByCompany: ReadonlyMap<string, LastFetch>;
}): BulkRow[] {
  return input.companies.map((company) => {
    const last = input.lastByCompany.get(company.id);
    return {
      companyId: company.id,
      readiness: ivaFetchReadiness({
        access: input.access,
        company: {
          status: company.status,
          tocCompanyId: company.toconline_company_id,
          tocCluster: company.toconline_cluster,
          nif: company.nif,
        },
        credential: credentialForReadiness(input.access, company.id, input.candidates),
        inFlight: input.inFlight.has(company.id),
      }),
      lastOutcome: last?.outcome ?? null,
      lastFinishedAt: last?.finishedAt ?? null,
    };
  });
}

export type BulkPlan = ReturnType<typeof planBulkFetch>;

/** O que cada `enqueueIvaFetch` de um lote acabou por fazer. */
export type EnqueueOutcome = "enqueued" | "already_running" | "failed";

export interface BulkCounts {
  enqueued: number;
  skipped: { alreadyRunning: number; notReady: number; alreadyFetched: number };
  /** Só os motivos com empresas — a interface não tem de mostrar zeros. */
  notReadyReasons: Partial<Record<IvaNotReadyReason, number>>;
}

/**
 * O plano mais o que realmente aconteceu.
 *
 * As duas fontes somam-se porque o plano é uma fotografia: entre planear e
 * enfileirar, outra pessoa pode ter lançado a busca da mesma empresa (`23505` →
 * `already_running`) ou a credencial pode ter sido apagada (`failed`). Contar só
 * o plano mostraria «5 enfileiradas» quando foram 3.
 */
export function tallyBulk(plan: BulkPlan, outcomes: readonly EnqueueOutcome[]): BulkCounts {
  let enqueued = 0;
  let racedIn = 0;
  let refused = 0;
  for (const outcome of outcomes) {
    if (outcome === "enqueued") enqueued += 1;
    else if (outcome === "already_running") racedIn += 1;
    else refused += 1;
  }

  const notReadyReasons: Partial<Record<IvaNotReadyReason, number>> = {};
  let notReady = 0;
  for (const [reason, ids] of Object.entries(plan.skipped.notReady) as [
    IvaNotReadyReason,
    string[],
  ][]) {
    if (ids.length === 0) continue;
    notReadyReasons[reason] = ids.length;
    notReady += ids.length;
  }

  return {
    enqueued,
    skipped: {
      alreadyRunning: plan.skipped.alreadyRunning.length + racedIn,
      notReady: notReady + refused,
      alreadyFetched: plan.skipped.alreadyFetched.length,
    },
    notReadyReasons,
  };
}
