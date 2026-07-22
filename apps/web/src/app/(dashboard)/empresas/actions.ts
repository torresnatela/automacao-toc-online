"use server";

import { revalidatePath } from "next/cache";
import {
  createCompanyFromInput,
  updateCompanyFromInput,
  deleteCompany,
  companyInputFrom,
  companyPatchFrom,
} from "@/lib/companies/service";
import type { CompanyFieldErrors } from "@toc/core/domain";

export interface CompanyFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: CompanyFieldErrors;
}

export async function createCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const input = companyInputFrom(Object.fromEntries(formData));
  const result = await createCompanyFromInput(input);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/empresas");
  return { ok: true };
}

// `id` é fixado via .bind(null, id) na página de edição.
export async function updateCompanyAction(
  id: string,
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const patch = companyPatchFrom(Object.fromEntries(formData));
  const result = await updateCompanyFromInput(id, patch);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  revalidatePath("/empresas");
  revalidatePath(`/empresas/${id}`);
  return { ok: true };
}

// Devolve o resultado (não engole): um delete bloqueado/falho não deve aparecer
// como sucesso. Só revalida quando de fato apagou.
export async function deleteCompanyAction(id: string): Promise<CompanyFormState> {
  const result = await deleteCompany(id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/empresas");
  return { ok: true };
}
