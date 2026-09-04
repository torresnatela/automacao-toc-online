"use client";

import { useActionState, useState } from "react";
import { DownloadCloud } from "lucide-react";
import { fetchAllIvaDocumentsAction, type FetchAllState } from "./actions";
import type { BulkPlanSummary } from "@/lib/documents/bulk";
import { formatNotReadyReasons } from "@/lib/documents/present";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface FetchAllButtonProps {
  teamId: string;
  /**
   * O plano tal como o servidor o calculou, com a MESMA `planBulkFetch` que a
   * ação vai correr. É o que permite anunciar quantas empresas serão
   * enfileiradas antes de o serem.
   */
  plan: BulkPlanSummary;
  /** Dias 20–25 (`isPeakDay`), decidido no servidor: o relógio é o de lá. */
  peak: boolean;
}

/**
 * O «buscar todas», com confirmação.
 *
 * Um clique aqui abre até 182 sessões de browser contra o Portal das Finanças —
 * é a ação mais cara do sistema e a que não se desfaz (os jobs enfileirados vão
 * correr). Daí o diálogo: diz o número **antes**, separa o que vai ser feito do
 * que vai ser saltado e porquê, e deixa decidir sobre as guias já obtidas este
 * mês em vez de decidir por quem clica.
 *
 * O plano é uma fotografia do servidor; entre vê-lo e confirmar, o mundo pode
 * mudar (outro operador, o worker a terminar um job). Por isso o número do
 * diálogo é uma intenção e o `role="status"` do fim é o que realmente
 * aconteceu — os dois podem legitimamente não coincidir.
 */
export function FetchAllButton({ teamId, plan, peak }: FetchAllButtonProps) {
  const [state, formAction, pending] = useActionState<FetchAllState, FormData>(
    fetchAllIvaDocumentsAction,
    {},
  );
  const [open, setOpen] = useState(false);
  /** A última resposta já refletida no ecrã — ver o ajuste mais abaixo. */
  const [answered, setAnswered] = useState<FetchAllState>(state);
  // A checkbox muda o número do botão: desmarcá-la acrescenta as já obtidas ao
  // lote, e quem confirma tem de ver esse número mudar antes de clicar.
  const [onlyMissing, setOnlyMissing] = useState(true);

  const total = onlyMissing ? plan.ready : plan.ready + plan.alreadyFetched;
  const reasons = formatNotReadyReasons(plan.notReadyReasons);
  const nothingReady = plan.ready === 0;

  // Fecha o diálogo quando a ação responde, e só então: fechá-lo no clique
  // esconderia o «A enfileirar…» e deixaria quem clicou sem saber se o pedido
  // chegou a sair.
  //
  // Ajuste durante a renderização (o padrão que o React documenta para "reagir
  // a uma mudança de valor") e não num `useEffect`: o efeito só correria depois
  // de o diálogo já ter sido pintado aberto por cima do resumo, e daria o
  // pisca-pisca de o fechar a seguir. `useActionState` devolve um objeto novo a
  // cada resposta, e é essa identidade que marca "houve resposta".
  if (answered !== state) {
    setAnswered(state);
    setOpen(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="accent"
            disabled={nothingReady}
            title={nothingReady ? "Nenhuma empresa pronta para buscar." : undefined}
          >
            <DownloadCloud aria-hidden /> Buscar todas
          </Button>
        </DialogTrigger>

        {/* O `title` não chega a quem usa leitor de ecrã nem a quem navega por
            teclado sem rato — o motivo tem de estar no acessível também. */}
        {nothingReady && <span className="sr-only">Nenhuma empresa pronta para buscar.</span>}

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buscar guias de IVA de todas as empresas?</DialogTitle>
            <DialogDescription>
              Vai enfileirar <strong>{plan.ready}</strong> empresas. {plan.inFlight} já estão em
              curso e {plan.notReady} não estão prontas
              {reasons === "" ? "" : ` (${reasons})`}.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="teamId" value={teamId} />

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="onlyMissing"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="mt-0.5 size-4 accent-brand-600"
              />
              Ignorar {plan.alreadyFetched} empresas com guia já obtida este mês
            </label>

            {peak && (
              <Alert>
                <AlertDescription>
                  Estamos entre os dias 20 e 25: o Portal das Finanças costuma estar lento e a busca
                  em lote pode demorar mais ou falhar por indisponibilidade. Pode continuar.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" variant="accent" disabled={pending}>
                {pending ? "A enfileirar…" : `Enfileirar ${total}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {state.error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.skipped && (
        <Alert variant="success" role="status" className="max-w-md">
          <AlertDescription>
            {state.enqueued} enfileiradas · {state.skipped.alreadyRunning} já em curso ·{" "}
            {state.skipped.notReady} não prontas · {state.skipped.alreadyFetched} já obtidas este
            mês
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
