import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ maxWidth: 320, margin: "80px auto", padding: "0 16px" }}>
      <h1>Entrar</h1>
      {error ? (
        <p role="alert" style={{ color: "crimson" }}>
          Credenciais inválidas.
        </p>
      ) : null}
      <form action={signIn} style={{ display: "grid", gap: 8 }}>
        <input name="email" type="email" placeholder="email" required aria-label="email" />
        <input name="password" type="password" placeholder="senha" required aria-label="senha" />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
