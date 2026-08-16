"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renderiza a página no servidor em intervalo, enquanto `active`.
 *
 * Existe para acompanhar trabalho assíncrono (um job na fila consumido pelo
 * worker) sem introduzir uma camada de fetch no cliente. As páginas do
 * dashboard já são `force-dynamic`, portanto `router.refresh()` traz estado
 * fresco pelo mesmo caminho de leitura de sempre — com a RLS a aplicar-se
 * exatamente como no primeiro render.
 *
 * Não renderiza nada.
 */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
