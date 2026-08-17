"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import type { CredentialSummaryRow } from "@/lib/integrations/service";
import type { TeamRow } from "@/lib/teams/service";
import {
  saveTocCredentialAction,
  deleteTocCredentialAction,
  type CredentialFormState,
} from "./actions";
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

export interface TocCredentialFormProps {
  credential: CredentialSummaryRow | null;
  /** Preenchido só para admin (que não tem equipe fixa). */
  teams: TeamRow[];
  isAdmin: boolean;
  /** Equipe que a página está a mostrar. Para o admin, vem da query string. */
  teamId: string;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function TocCredentialForm({
  credential,
  teams,
  isAdmin,
  teamId,
}: TocCredentialFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CredentialFormState, FormData>(
    saveTocCredentialAction,
    {},
  );
  const [removeState, removeAction, removing] = useActionState<CredentialFormState, FormData>(
    deleteTocCredentialAction,
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

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Ligação ao TOConline</CardTitle>
          {connected ? (
            <Badge tone="success">Ligado</Badge>
          ) : (
            <Badge tone="neutral">Não configurado</Badge>
          )}
        </div>
        <CardDescription>
          As credenciais do gabinete são guardadas cifradas e usadas pelo worker para entrar no
          TOConline. A palavra-passe nunca é mostrada de volta.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="grid gap-5">
          {isAdmin && (
            <FormField
              label="Equipe"
              htmlFor="c-team"
              error={fe.teamId}
              hint="Trocar de equipe recarrega a ligação correspondente."
            >
              <Select
                id="c-team"
                name="teamId"
                value={teamId}
                onChange={(e) => router.push(`/integracoes/toconline?team=${e.target.value}`)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField label="Utilizador TOConline" htmlFor="c-username" error={fe.username}>
            <Input
              id="c-username"
              name="username"
              type="email"
              autoComplete="username"
              defaultValue={credential?.username ?? ""}
              required
              {...invalid("username")}
            />
          </FormField>

          {changing ? (
            <FormField
              label="Palavra-passe"
              htmlFor="c-password"
              error={fe.password}
              hint={connected ? "Deixe em branco para manter a palavra-passe atual." : undefined}
            >
              <Input
                id="c-password"
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
              {pending ? "A guardar..." : connected ? "Guardar alterações" : "Ligar ao TOConline"}
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
              <AlertDescription>Ligação ao TOConline guardada.</AlertDescription>
            </Alert>
          )}
        </form>

        {confirmingRemoval && (
          <Alert variant="destructive" className="mt-5">
            <AlertDescription>
              <p className="mb-3">
                Remover a ligação apaga as credenciais guardadas. As empresas já importadas ficam
                como estão.
              </p>
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
