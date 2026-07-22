import "server-only";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { startAction } from "@/lib/observability";
import { ROLE_ORDER } from "@toc/core/auth";
import {
  createCompany,
  updateCompany,
  type CompanyRepo,
  type CompanyInput,
  type CompanyRecord,
  type CompanyFieldErrors,
} from "@toc/core/domain";

export interface CompanyRow {
  id: string;
  team_id: string;
  niss: number;
  nif: string | null;
  name: string;
  type: string;
  status: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  notes: string | null;
}

const COLUMNS =
  "id, team_id, niss, nif, name, type, status, email, phone, address_line1, address_line2, postal_code, city, country, notes";

export type CompanyMutationResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; fieldErrors?: CompanyFieldErrors };

// Constrói um CompanyInput a partir de um objeto cru (JSON da API ou FormData da
// action, convertida com Object.fromEntries). A validação/normalização real fica
// no @toc/core; aqui só coletamos os campos.
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

export function companyInputFrom(src: Record<string, unknown>): CompanyInput {
  return {
    teamId: String(src.teamId ?? ""),
    niss: String(src.niss ?? ""),
    nif: str(src.nif),
    name: String(src.name ?? ""),
    type: src.type as CompanyInput["type"],
    status: (src.status as CompanyInput["status"]) || undefined,
    email: str(src.email),
    phone: str(src.phone),
    addressLine1: str(src.addressLine1),
    addressLine2: str(src.addressLine2),
    postalCode: str(src.postalCode),
    city: str(src.city),
    country: str(src.country),
    notes: str(src.notes),
  };
}

// PATCH parcial: só os campos PRESENTES no corpo entram no patch. Ausente = mantém
// o valor atual (o merge com a linha existente acontece em updateCompanyFromInput).
export function companyPatchFrom(src: Record<string, unknown>): Partial<CompanyInput> {
  const patch: Partial<CompanyInput> = {};
  if ("teamId" in src) patch.teamId = String(src.teamId ?? "");
  if ("niss" in src) patch.niss = String(src.niss ?? "");
  if ("nif" in src) patch.nif = str(src.nif);
  if ("name" in src) patch.name = String(src.name ?? "");
  if ("type" in src) patch.type = src.type as CompanyInput["type"];
  if ("status" in src) patch.status = (src.status as CompanyInput["status"]) || undefined;
  if ("email" in src) patch.email = str(src.email);
  if ("phone" in src) patch.phone = str(src.phone);
  if ("addressLine1" in src) patch.addressLine1 = str(src.addressLine1);
  if ("addressLine2" in src) patch.addressLine2 = str(src.addressLine2);
  if ("postalCode" in src) patch.postalCode = str(src.postalCode);
  if ("city" in src) patch.city = str(src.city);
  if ("country" in src) patch.country = str(src.country);
  if ("notes" in src) patch.notes = str(src.notes);
  return patch;
}

// Linha persistida → CompanyInput (base do merge de PATCH parcial).
function companyRowToInput(row: CompanyRow): CompanyInput {
  return {
    teamId: row.team_id,
    niss: String(row.niss),
    nif: row.nif,
    name: row.name,
    type: row.type as CompanyInput["type"],
    status: row.status as CompanyInput["status"],
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    notes: row.notes,
  };
}

// --- Leitura (RLS aplica o escopo por equipe automaticamente) ---

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("companies").select(COLUMNS).order("name", { ascending: true });
  return (data ?? []) as CompanyRow[];
}

export async function getCompany(id: string): Promise<CompanyRow | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("companies").select(COLUMNS).eq("id", id).maybeSingle();
  return (data ?? null) as CompanyRow | null;
}

// --- Escrita (service role bypassa RLS; checagem de papel/equipe aqui) ---

type Admin = ReturnType<typeof getSupabaseAdminClient>;

function toRow(r: CompanyRecord) {
  return {
    team_id: r.teamId,
    niss: r.niss,
    nif: r.nif,
    name: r.name,
    type: r.type,
    status: r.status,
    email: r.email,
    phone: r.phone,
    address_line1: r.addressLine1,
    address_line2: r.addressLine2,
    postal_code: r.postalCode,
    city: r.city,
    country: r.country,
    notes: r.notes,
  };
}

// Preserva o code do erro pg (ex.: "23505" = unique_violation) para o chamador
// distinguir colisão de NISS de um erro genérico, sem vazar a mensagem crua.
function repoError(error: { message: string; code?: string }): Error {
  const e = new Error(error.message);
  (e as { code?: string }).code = error.code;
  return e;
}

function companyRepo(admin: Admin): CompanyRepo {
  return {
    // Unicidade de NISS é POR EQUIPE: escopa a busca ao team_id (sem oráculo global).
    async findByNiss(teamId, niss) {
      const { data } = await admin
        .from("companies")
        .select("id")
        .eq("team_id", teamId)
        .eq("niss", niss)
        .maybeSingle();
      return data ? { id: (data as { id: string }).id } : null;
    },
    async insert(record) {
      const { data, error } = await admin
        .from("companies")
        .insert(toRow(record))
        .select("id")
        .single();
      if (error) throw repoError(error);
      return { id: (data as { id: string }).id };
    },
    async update(id, record) {
      const { data, error } = await admin
        .from("companies")
        .update({ ...toRow(record), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw repoError(error);
      return { found: (data?.length ?? 0) > 0 };
    },
  };
}

const NISS_TAKEN = "Já existe uma empresa com este NISS.";

// Traduz uma exceção de escrita num resultado da API sem vazar detalhes internos.
// Colisão de NISS (unique_violation) vira erro de campo 400; o resto vira 500 genérico.
function mutationError(e: unknown): CompanyMutationResult {
  const code = (e as { code?: string })?.code;
  if (code === "23505") {
    return { ok: false, status: 400, error: NISS_TAKEN, fieldErrors: { niss: NISS_TAKEN } };
  }
  return { ok: false, status: 500, error: "Erro interno." };
}

// Requer papel >= operator. Distingue 401 (sem sessão) de 403 (papel insuficiente).
async function requireWriter(): Promise<
  { ok: true; actor: SessionUser } | { ok: false; status: number; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Não autenticado." };
  if (ROLE_ORDER.indexOf(user.role) < ROLE_ORDER.indexOf("operator")) {
    return { ok: false, status: 403, error: "Acesso restrito a operador ou administrador." };
  }
  return { ok: true, actor: user };
}

export async function createCompanyFromInput(input: CompanyInput): Promise<CompanyMutationResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { actor } = auth;

  // Escopo de equipe: admin escolhe; operador fixa a própria.
  let teamId = input.teamId;
  if (actor.role !== "admin") {
    if (!actor.teamId) {
      return { ok: false, status: 400, error: "Seu usuário não está atribuído a uma equipe." };
    }
    teamId = actor.teamId;
  }
  if (!teamId) {
    return {
      ok: false,
      status: 400,
      error: "Equipe é obrigatória.",
      fieldErrors: { teamId: "Equipe é obrigatória." },
    };
  }

  const admin = getSupabaseAdminClient();
  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    act = await startAction({
      triggerSource: "companies.create",
      type: "company.create",
      createdBy: actor.id,
      payload: { niss: String(input.niss) },
    });
    const result = await createCompany(companyRepo(admin), { ...input, teamId });
    if (!result.ok) {
      await act.failure("validação/unicidade");
      return {
        ok: false,
        status: 400,
        error: "Não foi possível cadastrar a empresa.",
        fieldErrors: result.fieldErrors,
      };
    }
    await act.success();
    return { ok: true, id: result.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return mutationError(e);
  }
}

export async function updateCompanyFromInput(
  id: string,
  patch: Partial<CompanyInput>,
): Promise<CompanyMutationResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("companies")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  // 404 (e NÃO 403) também para empresa de outra equipe: não revela existência
  // de registros de outros tenants a um operador que adivinhe ids.
  const notFound: CompanyMutationResult = { ok: false, status: 404, error: "Empresa não encontrada." };
  if (!existing) return notFound;
  const current = existing as CompanyRow;
  if (actor.role !== "admin" && current.team_id !== actor.teamId) return notFound;

  // Merge parcial: parte da linha atual e sobrepõe só os campos enviados.
  const merged: CompanyInput = { ...companyRowToInput(current), ...patch };
  // Operador nunca move a empresa de equipe; admin pode (via patch.teamId).
  if (actor.role !== "admin") merged.teamId = actor.teamId!;

  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    act = await startAction({
      triggerSource: "companies.update",
      type: "company.update",
      createdBy: actor.id,
      payload: { id },
    });
    const result = await updateCompany(companyRepo(admin), id, merged);
    if (!result.ok) {
      await act.failure("validação/unicidade");
      return {
        ok: false,
        status: 400,
        error: "Não foi possível atualizar a empresa.",
        fieldErrors: result.fieldErrors,
      };
    }
    await act.success();
    return { ok: true, id: result.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return mutationError(e);
  }
}

export async function deleteCompany(id: string): Promise<CompanyMutationResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("companies")
    .select("id, team_id")
    .eq("id", id)
    .maybeSingle();
  // 404 (não 403) também para empresa de outra equipe — ver updateCompanyFromInput.
  const notFound: CompanyMutationResult = { ok: false, status: 404, error: "Empresa não encontrada." };
  if (!existing) return notFound;
  const current = existing as { id: string; team_id: string };
  if (actor.role !== "admin" && current.team_id !== actor.teamId) return notFound;

  let act: Awaited<ReturnType<typeof startAction>> | undefined;
  try {
    act = await startAction({
      triggerSource: "companies.delete",
      type: "company.delete",
      createdBy: actor.id,
      payload: { id },
    });
    const { error } = await admin.from("companies").delete().eq("id", id);
    if (error) throw repoError(error);
    await act.success();
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act?.failure(message);
    return mutationError(e);
  }
}
