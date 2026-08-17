import "server-only";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { startAction } from "@/lib/observability";
import { resolveTeamScope } from "@toc/core/auth";
import { encryptSecret } from "@toc/core/crypto";
import {
  saveCredential,
  SCAN_JOB_TYPE,
  type CredentialFieldErrors,
  type CredentialInput,
  type CredentialRecord,
  type CredentialRepo,
  type IntegrationProvider,
  type ScanJobResult,
  type SecretCipher,
} from "@toc/core/domain";

export { SCAN_JOB_TYPE };

/**
 * Projeção segura de uma credencial. Vem da view `integration_credentials_safe`,
 * que **não tem** a coluna `secret_encrypted` — o ciphertext é estruturalmente
 * incapaz de chegar aqui, e daqui ao browser.
 */
export interface CredentialSummaryRow {
  id: string;
  team_id: string;
  provider: string;
  username: string | null;
  status: string;
  has_secret: boolean;
  last_verified_at: string | null;
  updated_at: string;
}

const SAFE_COLUMNS =
  "id, team_id, provider, username, status, has_secret, last_verified_at, updated_at";

/**
 * `jobs.result` é `jsonb`, portanto uma linha antiga pode não trazer todas as
 * chaves — daí `Partial`. A forma em si vem de `@toc/core`, escrita pelo worker:
 * duas declarações separadas já divergiram uma vez (`created` cá, `create` lá) e
 * o resultado foi a página mostrar um resumo vazio sem nada falhar.
 */
export type ScanResultDoc = Partial<ScanJobResult>;

export interface ScanJobRow {
  id: string;
  type: string;
  status: string;
  trace_id: string | null;
  result: ScanResultDoc | null;
  last_error: { message?: string } | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const JOB_COLUMNS =
  "id, type, status, trace_id, result, last_error, created_at, started_at, finished_at";

export type CredentialMutationResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; status: number; error: string; fieldErrors?: CredentialFieldErrors };

export type ScanEnqueueResult =
  | { ok: true; jobId: string; alreadyRunning: boolean }
  | { ok: false; status: number; error: string };

// --- Coleta de entrada -------------------------------------------------------

/**
 * ATENÇÃO: este é o **único** ponto que toca o objeto cru vindo do formulário,
 * e esse objeto contém a palavra-passe. Nunca o reencaminhe para `startAction`
 * nem para nenhum log — o padrão `Object.fromEntries(formData)` usado no resto
 * do repo é inofensivo lá, e não é aqui.
 */
export function credentialInputFrom(src: Record<string, unknown>): CredentialInput {
  return {
    teamId: String(src.teamId ?? ""),
    provider: (src.provider as IntegrationProvider) || "toconline",
    username: String(src.username ?? ""),
    password: src.password == null || src.password === "" ? null : String(src.password),
  };
}

// --- Leitura (RLS aplica o escopo por equipe através da view) ----------------

/**
 * A equipe é sempre explícita, nunca inferida da RLS.
 *
 * Para um operador a RLS já reduz a uma equipe, mas para um **admin** a view
 * devolve as credenciais de todas — e um `maybeSingle()` sobre várias linhas
 * falha, fazendo uma ligação existente aparecer como "não configurado".
 * O mesmo vale para o último job.
 */
export async function getTeamCredential(
  provider: IntegrationProvider,
  teamId: string,
): Promise<CredentialSummaryRow | null> {
  if (!teamId) return null;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("integration_credentials_safe")
    .select(SAFE_COLUMNS)
    .eq("team_id", teamId)
    .eq("provider", provider)
    .is("company_id", null)
    .maybeSingle();
  return (data ?? null) as CredentialSummaryRow | null;
}

export async function getLatestScanJob(teamId: string): Promise<ScanJobRow | null> {
  if (!teamId) return null;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("team_id", teamId)
    .eq("type", SCAN_JOB_TYPE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as ScanJobRow | null;
}

// --- Escrita (service role bypassa RLS; checagem de papel/equipe aqui) -------

type Admin = ReturnType<typeof getSupabaseAdminClient>;

/**
 * Sessão + equipa numa passagem. A **decisão** (papel suficiente? que equipa?)
 * está em `@toc/core/auth`, testada sem Next nem Supabase; aqui fica só a leitura
 * da sessão.
 */
async function requireWriterOn(
  requestedTeamId: string,
): Promise<
  { ok: true; actor: SessionUser; teamId: string } | { ok: false; status: number; error: string }
> {
  const actor = await getSessionUser();
  const scope = resolveTeamScope(actor, requestedTeamId);
  if (!scope.ok) return scope;
  // Inalcançável — sem sessão o `scope` acima já teria devolvido 401. Está aqui
  // para estreitar o tipo sem um `as`.
  if (!actor) return { ok: false, status: 401, error: "Não autenticado." };
  return { ok: true, actor, teamId: scope.teamId };
}

const cipher: SecretCipher = { encrypt: (plaintext) => encryptSecret(plaintext) };

function credentialRepo(admin: Admin): CredentialRepo {
  return {
    async findByTeamProvider(teamId, provider) {
      const { data } = await admin
        .from("integration_credentials")
        .select("id, secret_encrypted")
        .eq("team_id", teamId)
        .eq("provider", provider)
        .is("company_id", null)
        .maybeSingle();
      if (!data) return null;
      const row = data as { id: string; secret_encrypted: string | null };
      return { id: row.id, hasSecret: row.secret_encrypted !== null };
    },
    async insert(record) {
      const { data, error } = await admin
        .from("integration_credentials")
        .insert(toRow(record))
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },
    async update(id, record) {
      const patch = toRow(record);
      // `null` significa "não toques no segredo" — o formulário não reexibe a
      // palavra-passe, logo não a pode reenviar. Omitir a coluna é o que
      // preserva o valor guardado.
      if (record.secretEncrypted === null) delete patch.secret_encrypted;

      const { data, error } = await admin
        .from("integration_credentials")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      return { found: (data?.length ?? 0) > 0 };
    },
  };
}

function toRow(r: CredentialRecord): Record<string, unknown> {
  return {
    team_id: r.teamId,
    provider: r.provider,
    username: r.username,
    secret_encrypted: r.secretEncrypted,
    status: r.status,
    metadata: r.metadata,
  };
}

export async function saveCredentialFromInput(
  input: CredentialInput,
): Promise<CredentialMutationResult> {
  const auth = await requireWriterOn(input.teamId);
  if (!auth.ok) return auth;
  const { actor, teamId } = auth;

  const admin = getSupabaseAdminClient();
  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    // O payload leva equipe e provider — nunca o utilizador (é PII de terceiro)
    // e muito menos a palavra-passe.
    act = await startAction({
      triggerSource: "integrations.toconline.credential",
      type: "integration.credential_saved",
      createdBy: actor.id,
      payload: { teamId, provider: input.provider },
    });

    const result = await saveCredential(credentialRepo(admin), cipher, { ...input, teamId });
    if (!result.ok) {
      await act.failure("validação");
      return {
        ok: false,
        status: 400,
        error: result.error ?? "Não foi possível guardar a credencial.",
        fieldErrors: result.fieldErrors,
      };
    }

    await act.success();
    return { ok: true, id: result.id, created: result.created };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return { ok: false, status: 500, error: "Erro interno." };
  }
}

export async function deleteCredentialFor(
  provider: IntegrationProvider,
  requestedTeamId = "",
): Promise<CredentialMutationResult> {
  const auth = await requireWriterOn(requestedTeamId);
  if (!auth.ok) return auth;
  const { actor, teamId } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("integration_credentials")
    .select("id")
    .eq("team_id", teamId)
    .eq("provider", provider)
    .is("company_id", null)
    .maybeSingle();
  if (!existing) return { ok: false, status: 404, error: "Ligação não encontrada." };
  const id = (existing as { id: string }).id;

  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    act = await startAction({
      triggerSource: "integrations.toconline.credential",
      type: "integration.credential_removed",
      createdBy: actor.id,
      payload: { teamId, provider },
    });
    const { error } = await admin.from("integration_credentials").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await act.success();
    return { ok: true, id, created: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return { ok: false, status: 500, error: "Erro interno." };
  }
}

export async function enqueueCompanyScan(requestedTeamId = ""): Promise<ScanEnqueueResult> {
  const auth = await requireWriterOn(requestedTeamId);
  if (!auth.ok) return auth;
  const { actor, teamId } = auth;

  const admin = getSupabaseAdminClient();

  const { data: credential } = await admin
    .from("integration_credentials")
    .select("id, secret_encrypted")
    .eq("team_id", teamId)
    .eq("provider", "toconline")
    .is("company_id", null)
    .maybeSingle();
  const cred = credential as { id: string; secret_encrypted: string | null } | null;
  if (!cred || !cred.secret_encrypted) {
    return { ok: false, status: 400, error: "Configure a ligação ao TOConline antes de varrer." };
  }

  // Um duplo-clique não pode lançar duas sessões de browser contra o TOConline.
  // Devolvemos o job em curso em vez de criar outro — e sem abrir trace novo,
  // que ficaria órfão.
  const { data: running } = await admin
    .from("jobs")
    .select("id")
    .eq("type", SCAN_JOB_TYPE)
    .eq("team_id", teamId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();
  if (running) {
    return { ok: true, jobId: (running as { id: string }).id, alreadyRunning: true };
  }

  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    act = await startAction({
      triggerSource: "integrations.toconline.scan",
      type: "job.enqueued",
      createdBy: actor.id,
      correlationKey: `team:${teamId}:toconline`,
      payload: { teamId, provider: "toconline", jobType: SCAN_JOB_TYPE },
    });

    const { data, error } = await admin
      .from("jobs")
      .insert({
        team_id: teamId,
        type: SCAN_JOB_TYPE,
        trace_id: act.traceId,
        triggering_event_id: act.eventId,
        payload: { teamId, credentialId: cred.id, provider: "toconline" },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // handOff e não success: o trace fica ABERTO até o worker terminar. Um job
    // enfileirado e nunca consumido deve aparecer como trace por fechar.
    await act.handOff();
    return { ok: true, jobId: (data as { id: string }).id, alreadyRunning: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return { ok: false, status: 500, error: "Erro interno." };
  }
}
