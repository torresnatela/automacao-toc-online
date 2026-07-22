import type { CompanyInput, CompanyRecord } from "../types";
import { validateCompanyInput, type CompanyFieldErrors } from "./validate";

/**
 * Porta de persistência da empresa. A implementação real (na app web) usa o
 * cliente Supabase; os testes usam fakes em memória.
 */
export interface CompanyRepo {
  // NISS é único POR EQUIPE (não global): a checagem de duplicidade é escopada.
  findByNiss(teamId: string, niss: number): Promise<{ id: string } | null>;
  insert(record: CompanyRecord): Promise<{ id: string }>;
  // `found: false` quando nenhuma linha casou o id (empresa inexistente).
  update(id: string, record: CompanyRecord): Promise<{ found: boolean }>;
}

export type CompanyServiceOutput =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: CompanyFieldErrors; error?: string };

function nn(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/** Converte a entrada validada num registro pronto para persistir. */
export function normalizeCompany(input: CompanyInput): CompanyRecord {
  return {
    teamId: input.teamId.trim(),
    niss: Number(String(input.niss).trim()),
    nif: nn(input.nif),
    name: input.name.trim(),
    type: input.type,
    status: input.status ?? "active",
    email: nn(input.email),
    phone: nn(input.phone),
    addressLine1: nn(input.addressLine1),
    addressLine2: nn(input.addressLine2),
    postalCode: nn(input.postalCode),
    city: nn(input.city),
    country: (nn(input.country) ?? "PT").toUpperCase(),
    notes: nn(input.notes),
  };
}

/** Valida, garante NISS único e insere. Lógica pura + injeção de dependência. */
export async function createCompany(
  repo: CompanyRepo,
  input: CompanyInput,
): Promise<CompanyServiceOutput> {
  const fieldErrors = validateCompanyInput(input);
  if (fieldErrors) return { ok: false, fieldErrors };

  const record = normalizeCompany(input);

  const existing = await repo.findByNiss(record.teamId, record.niss);
  if (existing) {
    return { ok: false, fieldErrors: { niss: "Já existe uma empresa com este NISS." } };
  }

  const { id } = await repo.insert(record);
  return { ok: true, id };
}

/** Valida, garante NISS único (exceto a própria) e atualiza. */
export async function updateCompany(
  repo: CompanyRepo,
  id: string,
  input: CompanyInput,
): Promise<CompanyServiceOutput> {
  const fieldErrors = validateCompanyInput(input);
  if (fieldErrors) return { ok: false, fieldErrors };

  const record = normalizeCompany(input);

  const existing = await repo.findByNiss(record.teamId, record.niss);
  if (existing && existing.id !== id) {
    return { ok: false, fieldErrors: { niss: "Já existe uma empresa com este NISS." } };
  }

  const { found } = await repo.update(id, record);
  if (!found) return { ok: false, error: "Empresa não encontrada." };
  return { ok: true, id };
}
