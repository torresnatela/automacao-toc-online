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
export function companyInputFrom(src: Record<string, unknown>): CompanyInput {
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
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

function companyRepo(admin: Admin): CompanyRepo {
  return {
    async findByNiss(niss) {
      const { data } = await admin.from("companies").select("id").eq("niss", niss).maybeSingle();
      return data ? { id: (data as { id: string }).id } : null;
    },
    async insert(record) {
      const { data, error } = await admin
        .from("companies")
        .insert(toRow(record))
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },
    async update(id, record) {
      const { error } = await admin
        .from("companies")
        .update({ ...toRow(record), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
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
  const act = await startAction({
    triggerSource: "companies.create",
    type: "company.create",
    createdBy: actor.id,
    payload: { niss: String(input.niss) },
  });
  try {
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
    await act.failure(message);
    return { ok: false, status: 500, error: message };
  }
}

export async function updateCompanyFromInput(
  id: string,
  input: CompanyInput,
): Promise<CompanyMutationResult> {
  const auth = await requireWriter();
  if (!auth.ok) return auth;
  const { actor } = auth;

  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin
    .from("companies")
    .select("id, team_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, status: 404, error: "Empresa não encontrada." };
  const current = existing as { id: string; team_id: string };

  let teamId = input.teamId;
  if (actor.role !== "admin") {
    if (current.team_id !== actor.teamId) {
      return { ok: false, status: 403, error: "Empresa pertence a outra equipe." };
    }
    teamId = actor.teamId!; // operador não move a empresa de equipe
  }
  if (!teamId) {
    return {
      ok: false,
      status: 400,
      error: "Equipe é obrigatória.",
      fieldErrors: { teamId: "Equipe é obrigatória." },
    };
  }

  const act = await startAction({
    triggerSource: "companies.update",
    type: "company.update",
    createdBy: actor.id,
    payload: { id },
  });
  try {
    const result = await updateCompany(companyRepo(admin), id, { ...input, teamId });
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
    await act.failure(message);
    return { ok: false, status: 500, error: message };
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
  if (!existing) return { ok: false, status: 404, error: "Empresa não encontrada." };
  const current = existing as { id: string; team_id: string };
  if (actor.role !== "admin" && current.team_id !== actor.teamId) {
    return { ok: false, status: 403, error: "Empresa pertence a outra equipe." };
  }

  const act = await startAction({
    triggerSource: "companies.delete",
    type: "company.delete",
    createdBy: actor.id,
    payload: { id },
  });
  try {
    const { error } = await admin.from("companies").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await act.success();
    return { ok: true, id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    await act.failure(message);
    return { ok: false, status: 500, error: message };
  }
}
