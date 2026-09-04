"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import {
  INVALID_REASON_LABELS,
  credentialStatusLabel,
  type IntegrationProvider,
} from "@toc/core/domain";
import type { CredentialSummaryRow } from "@/lib/integrations/service";
import type { CredentialFormState } from "@/lib/integrations/form-state";
import type { TeamRow } from "@/lib/teams/service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

/**
 * Máscara de comprimento FIXO. Nunca derivar do tamanho real da senha — isso
 * vazaria informação sobre o segredo sem nenhum ganho de interface.
 */
const MASK = "••••••••••••";

/** Textos que mudam de provider para provider. Tudo o resto é igual. */
export interface CredentialFormCopy {
  title: string;
  description: string;
  usernameLabel: string;
  /** `email` no TOConline; `text` onde o utilizador é um número (NIF na AT). */
  usernameType?: "email" | "text";
  usernameInputMode?: "numeric";
  usernameAutoComplete?: string;
  /** Rótulo do botão quando ainda não há credencial guardada. */
  connectLabel: string;
  savedMessage: string;
  /** O que se perde ao remover — dito antes de confirmar, não depois. */
  removeWarning: string;
}

export interface CredentialFormProps {
  provider: IntegrationProvider;
  credential: CredentialSummaryRow | null;
  /** Preenchido só para admin (que não tem equipe fixa). */
  teams: TeamRow[];
  isAdmin: boolean;
  /** Equipe que a página está a mostrar. Para o admin, vem da query string. */
  teamId: string;
  /**
   * Server Actions do provider. Podem atravessar a fronteira porque o React as
   * envia como referência, não como função — ao contrário de um callback nosso.
   */
  saveAction: (prev: CredentialFormState, fd: FormData) => Promise<CredentialFormState>;
  deleteAction: (prev: CredentialFormState, fd: FormData) => Promise<CredentialFormState>;
  /**
   * Rota desta página, para onde navegar ao trocar de equipe (o `?team=` é
   * acrescentado aqui). É uma string e não `(teamId) => string` porque quem
   * monta o componente é um Server Component, e uma função comum não é
   * serializável através dessa fronteira — rebentaria em runtime.
   */
  teamHref: string;
  copy: CredentialFormCopy;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
}

/**
 * A causa da invalidação, por extenso, a partir de `metadata.invalidReason`.
 *
 * `metadata` é escrito pelo worker e pode trazer qualquer coisa, daí a
 * verificação de tipo. Uma chave desconhecida mostra-se como veio; sem chave
 * nenhuma devolve `null` e a frase sai sem o parêntesis — nunca com
 * "(undefined)" no ecrã.
 */
function invalidReasonLabel(metadata: Record<string, unknown> | null): string | null {
  const reason = metadata?.invalidReason;
  if (typeof reason !== "string" || reason === "") return null;
  return INVALID_REASON_LABELS[reason] ?? reason;
}

/**
 * Formulário da credencial do gabinete, para qualquer provider.
 *
 * O que é igual em todos e por isso vive aqui: a senha nunca é reexibida (só há
 * máscara de comprimento fixo e um botão "Alterar"), guardar sem senha nova
 * mantém a que está, a remoção pede confirmação no próprio ecrã, e o admin
 * troca de equipe navegando — para que o estado da página e o do formulário
 * sejam sempre o mesmo. O que muda — provider, ações e textos — entra por
 * props, e o `provider` que conta é o que o servidor força nas ações: este
 * componente nunca o põe no `FormData`.
 */
export function CredentialForm({
  provider,
  credential,
  teams,
  isAdmin,
  teamId,
  saveAction,
  deleteAction,
  teamHref,
  copy,
}: CredentialFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CredentialFormState, FormData>(
    saveAction,
    {},
  );
  const [removeState, removeAction, removing] = useActionState<CredentialFormState, FormData>(
    deleteAction,
    {},
  );
  const connected = credential?.has_secret ?? false;
  // Com credencial guardada o campo nasce escondido: a senha não é reexibida,
  // e revelar o campo é um ato deliberado do utilizador.
  const [changing, setChanging] = useState(!connected);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const fe = state.fieldErrors ?? {};
  const invalid = (key: keyof typeof fe) => (fe[key] ? { "aria-invalid": true as const } : {});
  const verifiedAt = formatDate(credential?.last_verified_at ?? null);

  // O worker marca a credencial quando o portal a recusa. Guardar senha nova é
  // o único caminho de volta a `active` — e é isso que a frase tem de dizer,
  // senão o operador fica à espera de um botão que não existe.
  const blocked = credential !== null && credential.status !== "active" ? credential.status : null;
  const blockedReason = blocked === null ? null : invalidReasonLabel(credential?.metadata ?? null);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{copy.title}</CardTitle>
          {connected ? (
            <Badge tone="success">Ligado</Badge>
          ) : (
            <Badge tone="neutral">Não configurado</Badge>
          )}
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>

      <CardContent>
        {blocked !== null && (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription>
              Credencial marcada como {credentialStatusLabel(blocked)} pelo worker
              {blockedReason === null ? "" : ` (${blockedReason})`}. Guardar uma palavra-passe nova
              reativa-a.
            </AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="grid gap-5">
          {isAdmin && (
            <FormField
              label="Equipe"
              htmlFor={`${provider}-team`}
              error={fe.teamId}
              hint="Trocar de equipe recarrega a ligação correspondente."
            >
              <Select
                id={`${provider}-team`}
                name="teamId"
                value={teamId}
                onChange={(e) => router.push(`${teamHref}?team=${e.target.value}`)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField
            label={copy.usernameLabel}
            htmlFor={`${provider}-username`}
            error={fe.username}
          >
            <Input
              id={`${provider}-username`}
              name="username"
              type={copy.usernameType ?? "text"}
              inputMode={copy.usernameInputMode}
              autoComplete={copy.usernameAutoComplete}
              defaultValue={credential?.username ?? ""}
              required
              {...invalid("username")}
            />
          </FormField>

          {changing ? (
            <FormField
              label="Palavra-passe"
              htmlFor={`${provider}-password`}
              error={fe.password}
              hint={connected ? "Deixe em branco para manter a palavra-passe atual." : undefined}
            >
              <Input
                id={`${provider}-password`}
                name="password"
                type="password"
                autoComplete="new-password"
                {...invalid("password")}
              />
            </FormField>
          ) : (
            <FormField label="Palavra-passe">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground font-mono tracking-widest">{MASK}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setChanging(true)}>
                  <KeyRound aria-hidden /> Alterar
                </Button>
              </div>
            </FormField>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "A guardar..." : connected ? "Guardar alterações" : copy.connectLabel}
            </Button>
            {connected && !confirmingRemoval && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingRemoval(true)}
              >
                <Trash2 aria-hidden /> Remover ligação
              </Button>
            )}
          </div>

          {verifiedAt && (
            <p className="text-muted-foreground text-sm">Última verificação: {verifiedAt}</p>
          )}

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.ok && (
            <Alert variant="success" role="status">
              <AlertDescription>{copy.savedMessage}</AlertDescription>
            </Alert>
          )}
        </form>

        {confirmingRemoval && (
          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <p className="mb-3">{copy.removeWarning}</p>
              <form action={removeAction} className="flex items-center gap-3">
                <input type="hidden" name="teamId" value={teamId} />
                <Button type="submit" variant="destructive" size="sm" disabled={removing}>
                  {removing ? "A remover..." : "Confirmar remoção"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRemoval(false)}
                >
                  Cancelar
                </Button>
              </form>
              {removeState.error && <p className="mt-2 text-sm">{removeState.error}</p>}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
