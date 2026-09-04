import "server-only";
import { requireWriterOn } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { startAction } from "@/lib/observability";
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
  /**
   * O que o worker anotou sobre esta credencial (`invalidReason`, `invalidAt`,
   * `attemptsLeft`, …). É o que dá a **causa** por trás de um `status` que não
   * é `active`: sem isto a interface só sabe dizer "inválida", e o operador não
   * sabe se corrige a senha, se espera, ou se o portal pediu código por SMS.
   * Nunca contém o segredo — essa coluna é outra, e a view não a tem.
   */
  metadata: Record<string, unknown> | null;
  has_secret: boolean;
  last_verified_at: string | null;
  updated_at: string;
}

const SAFE_COLUMNS =
  "id, team_id, provider, username, status, metadata, has_secret, last_verified_at, updated_at";

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

const cipher: SecretCipher = { encrypt: (plaintext) => encryptSecret(plaintext) };

/**
 * Marcadores que o worker escreve em `metadata` ao invalidar uma credencial.
 * Guardar senha nova apaga-os; tudo o resto que lá esteja fica.
 */
const INVALID_MARKERS = ["invalidReason", "invalidAt", "attemptsLeft"] as const;

/** Exportada para teste: é aqui que se decide o que sobrevive à reativação. */
export function withoutInvalidMarkers(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const clean = { ...metadata };
  for (const key of INVALID_MARKERS) delete clean[key];
  return clean;
}

/** O estado que o adaptador precisa de conhecer da linha guardada. */
type CredentialState = { status: string; metadata: Record<string, unknown> };

export function credentialRepo(admin: Admin): CredentialRepo {
  // Cache — nunca uma pré-condição. O port do domínio só transporta
  // `id`/`hasSecret` (é tudo o que a regra de negócio precisa de saber), mas o
  // adaptador precisa do `metadata` atual para o **filtrar** em vez de o deitar
  // fora: só ele sabe que a coluna existe. Como `saveCredential` chama sempre
  // `findByTeamProvider` antes do `update`, isto poupa a segunda query — mas o
  // `update` relê a linha se ela faltar, porque um adaptador que se cala e
  // apaga o `metadata` quando o chamam fora da ordem esperada é exatamente o
  // tipo de bug que ninguém vê.
  let current: CredentialState | null = null;

  /** A linha tal como está guardada, pelo `id` que o `update` recebe. */
  async function readState(id: string): Promise<CredentialState | null> {
    const { data } = await admin
      .from("integration_credentials")
      .select("status, metadata")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const row = data as { status: string; metadata: Record<string, unknown> | null };
    return { status: row.status, metadata: row.metadata ?? {} };
  }

  return {
    async findByTeamProvider(teamId, provider) {
      const { data } = await admin
        .from("integration_credentials")
        .select("id, secret_encrypted, status, metadata")
        .eq("team_id", teamId)
        .eq("provider", provider)
        .is("company_id", null)
        .maybeSingle();
      if (!data) {
        current = null;
        return null;
      }
      const row = data as {
        id: string;
        secret_encrypted: string | null;
        status: string;
        metadata: Record<string, unknown> | null;
      };
      current = { status: row.status, metadata: row.metadata ?? {} };
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
      if (record.secretEncrypted === null) {
        // `null` significa "não toques no segredo" — o formulário não reexibe a
        // palavra-passe, logo não a pode reenviar. Omitir a coluna é o que
        // preserva o valor guardado. E sem segredo novo também não se toca no
        // estado: uma credencial que o worker marcou inválida continua inválida
        // por corrigir só o utilizador.
        delete patch.secret_encrypted;
        delete patch.status;
        delete patch.metadata;
      } else {
        // Guardar senha nova é a forma de reativar uma credencial marcada
        // inválida/expirada pelo worker — não há outro botão para isso. Repõe-se
        // `active` e apagam-se os marcadores da invalidação, preservando o resto
        // do `metadata` (que é do worker, não nosso). Sem a linha atual à mão,
        // relê-se: escrever `{}` porque a cache estava vazia seria repor o
        // apagão que esta mudança existe para eliminar.
        const state = current ?? (await readState(id));
        if (state !== null && state.status === "active") delete patch.status;
        else patch.status = "active";
        patch.metadata = withoutInvalidMarkers({
          ...(state?.metadata ?? {}),
          ...record.metadata,
        });
      }

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
      triggerSource: `integrations.${input.provider}.credential`,
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
      triggerSource: `integrations.${provider}.credential`,
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
