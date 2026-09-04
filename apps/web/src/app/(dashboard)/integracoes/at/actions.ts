"use server";

import { revalidatePath } from "next/cache";
import {
  credentialInputFrom,
  saveCredentialFromInput,
  deleteCredentialFor,
} from "@/lib/integrations/service";
import type { CredentialFormState } from "@/lib/integrations/form-state";

// ATENÇÃO: o FormData destas actions contém a palavra-passe da AT. O objeto cru
// de `Object.fromEntries` só pode ir para `credentialInputFrom` — nunca para um
// log, nunca para o payload de um trace.

/**
 * Guarda a credencial do Contabilista Certificado no Portal das Finanças.
 *
 * O `provider` vem **depois** do spread e é literal: mesmo que alguém injete um
 * campo `provider` no formulário, é este valor que fica. Sem isto, um POST
 * forjado com `provider=toconline` escreveria por cima da ligação ao TOConline
 * do gabinete, e a validação do NIF (que só existe para `at`) seria contornada.
 */
export async function saveAtCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const result = await saveCredentialFromInput(
    credentialInputFrom({ ...Object.fromEntries(formData), provider: "at" }),
  );
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };

  revalidatePath("/integracoes/at");
  return { ok: true };
}

export async function deleteAtCredentialAction(
  _prev: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const result = await deleteCredentialFor("at", String(formData.get("teamId") ?? ""));
  if (!result.ok) return { error: result.error };

  revalidatePath("/integracoes/at");
  return { ok: true };
}
