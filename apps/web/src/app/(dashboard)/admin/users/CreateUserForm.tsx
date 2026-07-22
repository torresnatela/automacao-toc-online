"use client";

import { useActionState } from "react";
import { createUser, type CreateUserState } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialState: CreateUserState = {};

export function CreateUserForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createUser, initialState);

  return (
    <Card className="mb-8 max-w-xl">
      <CardHeader>
        <CardTitle>Cadastrar usuário</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          <FormField label="Email" htmlFor="u-email">
            <Input id="u-email" name="email" type="email" required />
          </FormField>

          <FormField label="Nome completo" htmlFor="u-name">
            <Input id="u-name" name="full_name" type="text" />
          </FormField>

          <FormField label="Papel" htmlFor="u-role">
            <Select id="u-role" name="role" defaultValue="member">
              <option value="member">Member</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>

          <FormField label="Equipe" htmlFor="u-team">
            <Select id="u-team" name="team_id" defaultValue="">
              <option value="">— sem equipe (admin global) —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </div>

          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
        </form>

        {state.ok && (
          <Alert variant="success" role="status" className="mt-4 flex-col items-start">
            <AlertDescription className="opacity-100">
              Usuário <strong>{state.email}</strong> criado. Envie a senha temporária abaixo
              (mostrada apenas uma vez):
            </AlertDescription>
            <code className="mt-2 block rounded-md bg-success/10 px-2 py-1 text-lg select-all">
              {state.tempPassword}
            </code>
            {state.warning && (
              <p className="mt-2 text-sm text-warning">
                Atenção: {state.warning}. O usuário foi criado como Member — ajuste o papel se
                necessário.
              </p>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
