"use server";

import { revalidatePath } from "next/cache";
import {
  credentialInputFrom,
  saveCredentialFromInput,
  deleteCredentialFor,
  enqueueCompanyScan,
} from "@/lib/integrations/service";
import type { CredentialFieldErrors } from "@toc/core/domain";

// ATENÇÃO: o FormData destas actions contém a palavra-passe do TOConline. O
// objeto cru de `Object.fromEntries` só pode ir para `credentialInputFrom` —
// nunca para um log, nunca para o payload de um trace.

export interface CredentialFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: CredentialFieldErrors;
}

export async function saveTocCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const result = await saveCredentialFromInput(
    credentialInputFrom({ ...Object.fromEntries(formData), provider: "toconline" }),
  );
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };

  revalidatePath("/integracoes/toconline");
  return { ok: true };
}

export async function deleteTocCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const result = await deleteCredentialFor("toconline", String(formData.get("teamId") ?? ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/integracoes/toconline");
  return { ok: true };
}

export interface ScanFormState {
  ok?: boolean;
  error?: string;
  jobId?: string;
  alreadyRunning?: boolean;
}

export async function startCompanyScanAction(
  _prev: ScanFormState,
  formData: FormData,
): Promise<ScanFormState> {
  const result = await enqueueCompanyScan(String(formData.get("teamId") ?? ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/integracoes/toconline");
  revalidatePath("/empresas");
  return { ok: true, jobId: result.jobId, alreadyRunning: result.alreadyRunning };
}
