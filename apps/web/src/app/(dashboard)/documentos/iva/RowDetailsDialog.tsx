"use client";

import Link from "next/link";
import { Building2, Info, KeyRound, ScrollText } from "lucide-react";
import type { IvaRowState } from "@/lib/documents/outcomes";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { FetchButton, type FetchButtonProps } from "./FetchButton";

export interface RowDetailsDialogProps {
  companyName: string;
  /** Período já por extenso (`formatPeriodPt`) ou travessão. */
  periodLabel: string;
  state: IvaRowState;
  stateLabel: string;
  /** A orientação completa do desfecho, com os marcadores já preenchidos. */
  guidance: string;
  /**
   * `jobs.last_error.message`. É texto **nosso** — o worker nunca lá põe HTML,
   * senhas nem dados do contribuinte —, por isso pode ser mostrado tal como
   * está a quem já vê a empresa.
   */
  jobError?: string;
  /**
   * Ausente enquanto nunca houve job. `finishedAt` ausente enquanto o job ainda
   * corre — "Concluído: —" seria uma resposta a uma pergunta que ninguém fez.
   */
  job?: { attempts: number; finishedAt?: string };
  /** Já formatados no servidor: o Intl do browser pode não ser o mesmo. */
  payment?: { entity: string; reference: string; amount: string; dueDate: string };
  traceHref?: string;
  companyHref: string;
  /** Só nos desfechos que se resolvem numa credencial (`credentialLinkFor`). */
  credentialLink?: { href: string; label: string };
  /** O mesmo botão da linha — quem lê a orientação é quem quer voltar a tentar. */
  fetch: FetchButtonProps;
}

/**
 * A linha por extenso, num diálogo.
 *
 * A tabela tem 182 linhas e não cabe uma orientação de três frases em cada uma;
 * mas é a orientação que diz o que fazer, e mandá-la para outra página custaria
 * uma navegação (e o lugar na lista) por empresa. O diálogo é o meio-termo: a
 * linha continua curta, e o "porquê" fica a um clique — com a ação (buscar) e o
 * caminho da resolução (a credencial, a ficha da empresa, o trace) no mesmo
 * sítio, para o operador não ter de os ir procurar ao menu.
 *
 * Recebe tudo já resolvido pelo servidor, e nenhum objeto de domínio: o que
 * atravessa a fronteira são strings prontas a mostrar.
 */
export function RowDetailsDialog(props: RowDetailsDialogProps) {
  const { companyName, periodLabel, state, stateLabel, guidance, payment, job } = props;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info aria-hidden /> Detalhes
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{companyName}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>{periodLabel}</span>
            <StatusBadge kind="ivaDocument" value={state} label={stateLabel} />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <p>{guidance}</p>

          {props.jobError && (
            <Alert variant="destructive">
              <AlertDescription>{props.jobError}</AlertDescription>
            </Alert>
          )}

          {job && (
            <p className="text-muted-foreground text-xs">
              Tentativas: {job.attempts}
              {job.finishedAt === undefined ? "" : ` · Concluído: ${job.finishedAt}`}
            </p>
          )}

          {payment && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
              <dt className="text-muted-foreground">Entidade</dt>
              <dd className="text-right font-mono tabular-nums">{payment.entity}</dd>
              <dt className="text-muted-foreground">Referência</dt>
              <dd className="text-right font-mono tabular-nums">{payment.reference}</dd>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="text-right tabular-nums">{payment.amount}</dd>
              <dt className="text-muted-foreground">Prazo de pagamento</dt>
              <dd className="text-right tabular-nums">{payment.dueDate}</dd>
            </dl>
          )}

          <div className="flex flex-wrap gap-2">
            {props.credentialLink && (
              <Link
                href={props.credentialLink.href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <KeyRound aria-hidden /> {props.credentialLink.label}
              </Link>
            )}
            <Link
              href={props.companyHref}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Building2 aria-hidden /> Editar empresa
            </Link>
            {props.traceHref && (
              <Link
                href={props.traceHref}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <ScrollText aria-hidden /> Ver trace
              </Link>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Fechar
            </Button>
          </DialogClose>
          <FetchButton {...props.fetch} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
