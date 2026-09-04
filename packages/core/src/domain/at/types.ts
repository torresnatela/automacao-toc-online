import type { ObligationKind } from "../types";
import type { DocumentFieldWarning } from "./document";

/**
 * Contrato do Módulo 1 — guia de pagamento do IVA (dashboard ⇄ worker).
 *
 * Vive aqui, declarado **uma só vez**, pelo mesmo motivo que `SCAN_JOB_TYPE`:
 * `jobs.payload` e `jobs.result` são `jsonb`, e o dashboard (Vercel) e o worker
 * são *deployables* distintos. Duas cópias da mesma string divergem sem que
 * nada falhe — o dashboard enfileira, o worker nunca reclama, e o job fica
 * pendente para sempre.
 */

/**
 * Tipo do job que o dashboard enfileira e o worker consome.
 *
 * Este literal aparece também na view SQL `iva_documents_overview`: mudá-lo
 * obriga a uma migration.
 */
export const IVA_DOCUMENT_JOB_TYPE = "rpa.fetch_iva_document";

/** Valor de `documents.type` para a guia de pagamento do IVA. */
export const IVA_DOCUMENT_TYPE = "iva_payment";

/** Valor de `obligation_periods.kind` — espelha o pgEnum `obligation_kind`. */
export const IVA_OBLIGATION_KIND = "iva" satisfies ObligationKind;

/**
 * Como se chega ao Portal das Finanças.
 *
 * - `toconline_direct_access` (rota A) — o TOConline guarda a senha da AT da
 *   empresa e abre a sessão por nós («Acesso Direto»).
 * - `at_direct_login` (rota B) — entramos na AT com uma credencial nossa.
 */
export type AtAccessMode = "toconline_direct_access" | "at_direct_login";
export const AT_ACCESS_MODES = ["toconline_direct_access", "at_direct_login"] as const;

/** Regime de IVA da empresa. Subconjunto de `OBLIGATION_FREQUENCIES`. */
export type IvaFrequency = "monthly" | "quarterly";

/**
 * Etapa do fluxo onde o desfecho aconteceu — diagnóstico, não regra de negócio.
 *
 * A lista é a fonte e o tipo deriva dela (como `AT_ACCESS_MODES`) porque quem
 * lê o jsonb tem de filtrar pelos valores em tempo de execução: com uma união
 * solta, uma etapa nova entrava no tipo e o filtro deitava-a fora em silêncio.
 */
export const IVA_STAGES = [
  "precondition",
  "toconline",
  "direct_access",
  "at_login",
  "at_declaration",
  "at_document",
  "persist",
] as const;
export type IvaStage = (typeof IVA_STAGES)[number];

/** O que o dashboard escreve em `jobs.payload`. */
export interface IvaDocumentJobPayload {
  teamId: string;
  companyId: string;
  access: AtAccessMode;
  credentialId: string;
  credentialScope: "team" | "company";
  /** Período canónico (`YYYY-MM` / `YYYY-Qn`); ausente = o mais recente no portal. */
  period?: string;
  /** Ignora `already_fetched` — o «Buscar novamente» da interface. */
  force?: boolean;
  /** Presente quando o job nasceu de um «buscar todas». */
  batchId?: string;
}

const CREDENTIAL_SCOPES = ["team", "company"] as const;

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Lê `jobs.payload` (jsonb, logo `unknown`) sem lançar.
 *
 * `null` quando falta um campo obrigatório ou quando o modo de acesso / âmbito
 * da credencial não é reconhecido — o runner traduz isso em `payload_invalid`.
 * Os campos opcionais mal formados são ignorados em silêncio: não impedem o
 * trabalho, e um `period` inválido já é apanhado por `parsePeriod`.
 */
export function parseIvaDocumentPayload(raw: unknown): IvaDocumentJobPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const teamId = nonEmptyString(source.teamId);
  const companyId = nonEmptyString(source.companyId);
  const credentialId = nonEmptyString(source.credentialId);
  if (teamId === null || companyId === null || credentialId === null) return null;

  const access = AT_ACCESS_MODES.find((mode) => mode === source.access);
  if (access === undefined) return null;

  const credentialScope = CREDENTIAL_SCOPES.find((scope) => scope === source.credentialScope);
  if (credentialScope === undefined) return null;

  const payload: IvaDocumentJobPayload = {
    teamId,
    companyId,
    access,
    credentialId,
    credentialScope,
  };

  const period = nonEmptyString(source.period);
  if (period !== null) payload.period = period;
  if (source.force === true) payload.force = true;
  const batchId = nonEmptyString(source.batchId);
  if (batchId !== null) payload.batchId = batchId;

  return payload;
}

/**
 * Contexto de um desfecho: o que o worker sabia quando o produziu.
 *
 * Só uuids, período, datas, contagens e códigos — nunca senhas, nomes ou
 * valores monetários (isto vai para `jobs.result`/`last_error` e para eventos).
 */
export interface IvaOutcomeDetails {
  period?: string;
  frequency?: IvaFrequency;
  dueDate?: string;
  filingDeadline?: string;
  /** Tentativas que a AT diz faltarem antes de bloquear a senha. */
  attemptsLeft?: number;
  /**
   * Tentativas já feitas hoje para esta empresa — o contador do limite diário,
   * que preenche o `{n}` de `daily_cap_reached`. Nada tem que ver com
   * `jobs.attempts` (as tentativas deste job) nem com `attemptsLeft` (as que a
   * AT ainda concede à senha).
   */
  attempts?: number;
  stage?: IvaStage;
  /** Chave de `INVALID_REASON_LABELS`. */
  invalidReason?: string;
  obligationPeriodId?: string;
  documentId?: string;
  access?: AtAccessMode;
}

/** O que o worker grava em `jobs.result` quando a guia é obtida. */
export interface IvaDocumentJobResult {
  outcome: "fetched" | "fetched_without_fields";
  period: string;
  frequency: IvaFrequency;
  dueDate: string;
  obligationPeriodId: string;
  documentId: string;
  storagePath: string;
  hasFields: boolean;
  warnings: DocumentFieldWarning[];
  access: AtAccessMode;
}

/** Chaves de `jobs.result`, declaradas uma vez para as duas pontas. */
export const IVA_RESULT_KEYS = [
  "outcome",
  "period",
  "frequency",
  "dueDate",
  "obligationPeriodId",
  "documentId",
  "storagePath",
  "hasFields",
  "warnings",
  "access",
] as const satisfies readonly (keyof IvaDocumentJobResult)[];

export type IvaResultKey = (typeof IVA_RESULT_KEYS)[number];

/**
 * Guarda no sentido inverso do `satisfies` acima.
 *
 * O `satisfies` garante que nenhuma chave da lista falta na interface; este
 * alias garante o contrário — uma chave nova em `IvaDocumentJobResult` que não
 * entre em `IVA_RESULT_KEYS` torna-o `never` e a linha seguinte deixa de
 * compilar, em vez de a página ler um campo que ninguém escreve.
 */
type ResultKeysCoverAll =
  Exclude<keyof IvaDocumentJobResult, IvaResultKey> extends never ? true : never;
const resultKeysCoverAll: ResultKeysCoverAll = true;
void resultKeysCoverAll;
