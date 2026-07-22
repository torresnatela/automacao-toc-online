"use client";

import { useActionState } from "react";
import { CONTRIBUTOR_TYPES, COMPANY_STATUSES } from "@toc/core/domain";
import { CONTRIBUTOR_TYPE_LABELS, COMPANY_STATUS_LABELS, labelOf } from "@/lib/labels";
import type { CompanyRow } from "@/lib/companies/service";
import type { CompanyFormState } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface CompanyFormProps {
  action: (prev: CompanyFormState, formData: FormData) => Promise<CompanyFormState>;
  teams: { id: string; name: string }[];
  isAdmin: boolean;
  defaultTeamId: string | null;
  initial?: CompanyRow | null;
  title: string;
  submitLabel: string;
}

export function CompanyForm({
  action,
  teams,
  isAdmin,
  defaultTeamId,
  initial,
  title,
  submitLabel,
}: CompanyFormProps) {
  const [state, formAction, pending] = useActionState<CompanyFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const invalid = (key: keyof typeof fe) => (fe[key] ? { "aria-invalid": true as const } : {});

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-6">
          {/* Identificação fiscal */}
          <div className="grid gap-4 sm:grid-cols-2">
            {isAdmin && (
              <FormField
                label="Equipe"
                htmlFor="c-teamId"
                error={fe.teamId}
                className="sm:col-span-2"
              >
                <Select
                  id="c-teamId"
                  name="teamId"
                  defaultValue={initial?.team_id ?? defaultTeamId ?? ""}
                  required
                  {...invalid("teamId")}
                >
                  <option value="" disabled>
                    — selecione —
                  </option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="NISS" htmlFor="c-niss" error={fe.niss}>
              <Input
                id="c-niss"
                name="niss"
                inputMode="numeric"
                defaultValue={initial ? String(initial.niss) : ""}
                required
                {...invalid("niss")}
              />
            </FormField>
            <FormField label="NIF" htmlFor="c-nif" error={fe.nif}>
              <Input id="c-nif" name="nif" defaultValue={initial?.nif ?? ""} {...invalid("nif")} />
            </FormField>
            <FormField label="Nome" htmlFor="c-name" error={fe.name} className="sm:col-span-2">
              <Input
                id="c-name"
                name="name"
                defaultValue={initial?.name ?? ""}
                required
                {...invalid("name")}
              />
            </FormField>
            <FormField label="Tipo de contribuinte" htmlFor="c-type" error={fe.type}>
              <Select
                id="c-type"
                name="type"
                defaultValue={initial?.type ?? "employer"}
                {...invalid("type")}
              >
                {CONTRIBUTOR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelOf(CONTRIBUTOR_TYPE_LABELS, t)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status" htmlFor="c-status">
              <Select id="c-status" name="status" defaultValue={initial?.status ?? "active"}>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelOf(COMPANY_STATUS_LABELS, s)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* Contacto */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" htmlFor="c-email" error={fe.email}>
              <Input
                id="c-email"
                name="email"
                type="email"
                defaultValue={initial?.email ?? ""}
                {...invalid("email")}
              />
            </FormField>
            <FormField label="Telefone" htmlFor="c-phone">
              <Input id="c-phone" name="phone" defaultValue={initial?.phone ?? ""} />
            </FormField>
          </div>

          {/* Morada */}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Morada (linha 1)" htmlFor="c-a1" className="sm:col-span-2">
              <Input id="c-a1" name="addressLine1" defaultValue={initial?.address_line1 ?? ""} />
            </FormField>
            <FormField label="Morada (linha 2)" htmlFor="c-a2" className="sm:col-span-2">
              <Input id="c-a2" name="addressLine2" defaultValue={initial?.address_line2 ?? ""} />
            </FormField>
            <FormField label="Código postal" htmlFor="c-cp" error={fe.postalCode}>
              <Input
                id="c-cp"
                name="postalCode"
                placeholder="1049-013"
                defaultValue={initial?.postal_code ?? ""}
                {...invalid("postalCode")}
              />
            </FormField>
            <FormField label="Cidade" htmlFor="c-city">
              <Input id="c-city" name="city" defaultValue={initial?.city ?? ""} />
            </FormField>
            <FormField label="País" htmlFor="c-country" error={fe.country}>
              <Input
                id="c-country"
                name="country"
                maxLength={2}
                defaultValue={initial?.country ?? "PT"}
                {...invalid("country")}
              />
            </FormField>
          </div>

          <FormField label="Notas" htmlFor="c-notes">
            <Textarea id="c-notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} />
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
              <AlertDescription>Empresa salva com sucesso.</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
