import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { changePassword } from "./actions";

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
    <main style={{ maxWidth: 320, margin: "80px auto", padding: "0 16px" }}>
      <h1>Trocar senha</h1>
      <p>Defina uma nova senha para concluir o primeiro acesso.</p>
      {error ? (
        <p role="alert" style={{ color: "crimson" }}>
          {message}
        </p>
      ) : null}
      <form action={changePassword} style={{ display: "grid", gap: 8 }}>
        <input
          name="password"
          type="password"
          placeholder="nova senha"
          required
          minLength={6}
          aria-label="nova senha"
        />
        <input
          name="confirm"
          type="password"
          placeholder="confirmar senha"
          required
          minLength={6}
          aria-label="confirmar senha"
        />
        <button type="submit">Salvar</button>
      </form>
    </main>
  );
}
