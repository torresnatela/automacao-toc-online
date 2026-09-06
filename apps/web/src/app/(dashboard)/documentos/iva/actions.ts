"use server";

import { revalidatePath } from "next/cache";
import { enqueueIvaFetch, enqueueIvaFetchAll } from "@/lib/documents/service";
import { accessFromForm, forceFromForm, onlyMissingFromForm } from "@/lib/documents/bulk";

// O tempo máximo destas ações é `maxDuration` em `page.tsx`: um ficheiro
// "use server" só pode exportar funções assíncronas, e a configuração de
// segmento do Next vive na página — é ela que a Vercel aplica às ações
// invocadas a partir desta rota.
//
// Não há uma ação por rota: a rota vem no campo escondido `access` que cada
// botão escreve («Buscar» = login direto na AT, «Buscar via TOConline» = Acesso
// Direto), validada por `accessFromForm` — um valor forjado cai na rota B.

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
    {
      access: accessFromForm(formData.get("access")),
      // `force` é o campo escondido que o botão «Buscar novamente» acrescenta.
      force: forceFromForm(formData.get("force")),
    },
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
    access: accessFromForm(formData.get("access")),
    // Checkbox real do diálogo de confirmação: marcado chega como `"on"`,
    // desmarcado não chega de todo — e a ausência TEM de valer `false`, senão o
    // lote saltaria as empresas que o operador acabou de mandar rebuscar.
    onlyMissing: onlyMissingFromForm(formData.get("onlyMissing")),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/documentos/iva");
  return { ok: true, enqueued: result.enqueued, skipped: result.skipped };
}
