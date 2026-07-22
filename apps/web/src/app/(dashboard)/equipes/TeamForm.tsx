"use client";

import { useActionState } from "react";
import { TEAM_STATUSES } from "@toc/core/domain";
import { TEAM_STATUS_LABELS, labelOf } from "@/lib/labels";
import type { TeamRow } from "@/lib/teams/service";
import type { TeamFormState } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface TeamFormProps {
  action: (prev: TeamFormState, formData: FormData) => Promise<TeamFormState>;
  initial?: TeamRow | null;
  title: string;
  submitLabel: string;
}

export function TeamForm({ action, initial, title, submitLabel }: TeamFormProps) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const invalid = (key: keyof typeof fe) => (fe[key] ? { "aria-invalid": true as const } : {});

  return (
    <Card className="mb-8 max-w-xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          <FormField label="Nome do gabinete" htmlFor="t-name" error={fe.name}>
            <Input
              id="t-name"
              name="name"
              defaultValue={initial?.name ?? ""}
              required
              {...invalid("name")}
            />
          </FormField>

          <FormField label="NIF" htmlFor="t-nif" error={fe.nif}>
            <Input id="t-nif" name="nif" defaultValue={initial?.nif ?? ""} {...invalid("nif")} />
          </FormField>

          <FormField label="Status" htmlFor="t-status">
            <Select id="t-status" name="status" defaultValue={initial?.status ?? "active"}>
              {TEAM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labelOf(TEAM_STATUS_LABELS, s)}
                </option>
              ))}
            </Select>
          </FormField>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : submitLabel}
            </Button>
          </div>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.ok && (
            <Alert variant="success" role="status">
              <AlertDescription>Equipe salva com sucesso.</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
