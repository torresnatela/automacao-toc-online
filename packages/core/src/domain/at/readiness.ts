import type { IvaOutcome } from "./outcomes";
import type { AtAccessMode } from "./types";

/**
 * Prontidão para buscar a guia — a pergunta que o dashboard faz **antes** de
 * enfileirar seja o que for.
 *
 * Existe para que o botão saiba dizer porque está desligado e para que o
 * «buscar todas» não encha a fila de jobs condenados a `skipped`. A mesma
 * decisão é depois refeita pelo worker, com os dados frescos: isto é a versão
 * barata, não a autoridade.
 */
export type IvaNotReadyReason =
  | "in_flight"
  | "company_inactive"
  | "company_not_linked"
  | "nif_missing"
  | "credential_missing"
  | "credential_invalid";

export type IvaReadiness = { ready: true } | { ready: false; reason: IvaNotReadyReason };

/** Que fornecedor de credencial serve cada rota. */
export function providerForAccess(access: AtAccessMode): "toconline" | "at" {
  return access === "toconline_direct_access" ? "toconline" : "at";
}

/**
 * A ordem das verificações é a ordem por que se resolvem os problemas.
 *
 * Primeiro o que não é problema nenhum (já há um job a correr), depois o que
 * bloqueia toda a empresa (inativa), depois a credencial — que é partilhada e
 * cuja correção desbloqueia várias empresas de uma vez — e só no fim a
 * identidade da empresa, que é específica desta linha.
 */
export function ivaFetchReadiness(input: {
  access: AtAccessMode;
  company: {
    status: string;
    tocCompanyId: number | null;
    tocCluster: number | null;
    nif: string | null;
  };
  credential: { hasSecret: boolean; status: string } | null;
  inFlight: boolean;
}): IvaReadiness {
  if (input.inFlight) return { ready: false, reason: "in_flight" };
  if (input.company.status !== "active") return { ready: false, reason: "company_inactive" };

  const credential = input.credential;
  if (credential === null || !credential.hasSecret) {
    return { ready: false, reason: "credential_missing" };
  }
  if (credential.status !== "active") return { ready: false, reason: "credential_invalid" };

  if (input.access === "toconline_direct_access") {
    // Na rota A quem identifica a empresa no portal é o TOConline.
    if (input.company.tocCompanyId === null || input.company.tocCluster === null) {
      return { ready: false, reason: "company_not_linked" };
    }
    return { ready: true };
  }

  // Na rota B somos nós a escrever o NIF no formulário da AT.
  if (input.company.nif === null || input.company.nif.trim() === "") {
    return { ready: false, reason: "nif_missing" };
  }
  return { ready: true };
}

export interface BulkRow {
  companyId: string;
  readiness: IvaReadiness;
  lastOutcome: IvaOutcome | null;
  /** ISO do fim do último job desta empresa. */
  lastFinishedAt: string | null;
}

/**
 * Desfechos que dão o mês por resolvido — não vale a pena voltar a tentar.
 *
 * Repare que `declaration_not_submitted` **não** está aqui: o operador entrega
 * a declaração e volta a buscar no mesmo mês.
 */
const CONCLUSIVE_OUTCOMES: readonly IvaOutcome[] = [
  "fetched",
  "fetched_without_fields",
  "no_payment_document",
  "already_paid",
];

/** `YYYY-MM` em UTC, ou `null` se a data não for legível. */
function calendarMonth(iso: string | null): string | null {
  if (iso === null) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 7);
}

/**
 * Reparte as empresas de um «buscar todas» entre o que se enfileira e o que se
 * salta, com o motivo de cada salto.
 *
 * A interface mostra o resumo tal como sai daqui, por isso os motivos vêm
 * separados: "3 sem credencial" pede uma ação, "3 já obtidas" não pede nenhuma.
 */
export function planBulkFetch(
  rows: readonly BulkRow[],
  opts: { onlyMissing: boolean; now: Date },
): {
  toEnqueue: string[];
  skipped: {
    alreadyRunning: string[];
    notReady: Record<IvaNotReadyReason, string[]>;
    alreadyFetched: string[];
  };
} {
  const toEnqueue: string[] = [];
  const alreadyRunning: string[] = [];
  const alreadyFetched: string[] = [];
  // Todos os motivos presentes, mesmo vazios, para a interface não ter de os
  // adivinhar. `in_flight` fica sempre vazio: tem balde próprio.
  const notReady: Record<IvaNotReadyReason, string[]> = {
    in_flight: [],
    company_inactive: [],
    company_not_linked: [],
    nif_missing: [],
    credential_missing: [],
    credential_invalid: [],
  };

  const currentMonth = opts.now.toISOString().slice(0, 7);

  for (const row of rows) {
    if (!row.readiness.ready) {
      if (row.readiness.reason === "in_flight") alreadyRunning.push(row.companyId);
      else notReady[row.readiness.reason].push(row.companyId);
      continue;
    }

    const settledThisMonth =
      row.lastOutcome !== null &&
      CONCLUSIVE_OUTCOMES.includes(row.lastOutcome) &&
      calendarMonth(row.lastFinishedAt) === currentMonth;

    if (opts.onlyMissing && settledThisMonth) alreadyFetched.push(row.companyId);
    else toEnqueue.push(row.companyId);
  }

  return { toEnqueue, skipped: { alreadyRunning, notReady, alreadyFetched } };
}
