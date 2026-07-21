import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { changePassword } from "./actions";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const message =
    error === "salvar"
      ? "Não foi possível concluir a troca. Tente novamente."
      : "Senha inválida (mínimo 6 caracteres e as duas iguais).";

  return (
    <AuthLayout
      title="Trocar senha"
      subtitle="Defina uma nova senha para concluir o primeiro acesso."
    >
      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <form action={changePassword} className="grid gap-4">
        <FormField label="Nova senha" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            minLength={6}
            aria-label="nova senha"
          />
        </FormField>
        <FormField label="Confirmar senha" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            placeholder="••••••••"
            required
            minLength={6}
            aria-label="confirmar senha"
          />
        </FormField>
        <Button type="submit" className="mt-2 w-full">
          Salvar
        </Button>
      </form>
    </AuthLayout>
  );
}
