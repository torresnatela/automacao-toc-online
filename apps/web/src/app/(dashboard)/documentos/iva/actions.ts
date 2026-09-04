"use server";

import { revalidatePath } from "next/cache";
import { enqueueIvaFetch, enqueueIvaFetchAll } from "@/lib/documents/service";

// O tempo máximo destas ações é `maxDuration` em `page.tsx`: um ficheiro
// "use server" só pode exportar funções assíncronas, e a configuração de
// segmento do Next vive na página — é ela que a Vercel aplica às ações
// invocadas a partir desta rota.

export interface FetchState {
  ok?: boolean;
  error?: string;
  jobId?: string;
  alreadyRunning?: boolean;
}

export async function fetchIvaDocumentAction(
  _prev: FetchState,
  formData: FormData,
): Promise<FetchState> {
  const result = await enqueueIvaFetch(
    String(formData.get("companyId") ?? ""),
    String(formData.get("teamId") ?? ""),
    { force: formData.get("force") === "on" },
  );
  if (!result.ok) return { error: result.error };

  revalidatePath("/documentos/iva");
  return { ok: true, jobId: result.jobId, alreadyRunning: result.alreadyRunning };
}

export interface FetchAllState {
  ok?: boolean;
  error?: string;
  enqueued?: number;
  skipped?: { alreadyRunning: number; notReady: number; alreadyFetched: number };
}

export async function fetchAllIvaDocumentsAction(
  _prev: FetchAllState,
  formData: FormData,
): Promise<FetchAllState> {
  const result = await enqueueIvaFetchAll(String(formData.get("teamId") ?? ""), {
    // A caixa só chega no `FormData` quando está marcada — é assim que o HTML
    // envia um checkbox, e não um `false`.
    onlyMissing: formData.get("onlyMissing") === "on",
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/documentos/iva");
  return { ok: true, enqueued: result.enqueued, skipped: result.skipped };
}
