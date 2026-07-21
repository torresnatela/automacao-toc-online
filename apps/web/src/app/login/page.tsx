import { signIn } from "./actions";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthLayout title="Entrar" subtitle="Acede ao painel de automação fiscal.">
      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>Credenciais inválidas.</AlertDescription>
        </Alert>
      ) : null}
      <form action={signIn} className="grid gap-4">
        <FormField label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="voce@exemplo.pt"
            required
            aria-label="email"
          />
        </FormField>
        <FormField label="Senha" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            aria-label="senha"
          />
        </FormField>
        <Button type="submit" className="mt-2 w-full">
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
