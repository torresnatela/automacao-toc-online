import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

interface TraceRow {
  id: string;
  root_trigger: string;
  status: string;
  started_at: string;
}

export default async function TracesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("traces")
    .select("id, root_trigger, status, started_at")
    .order("started_at", { ascending: false })
    .limit(50);
  const traces = (data ?? []) as TraceRow[];

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
      >
        <h1>Traces</h1>
        <form action={signOut} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>
            {user.email} ({user.role})
          </span>
          <button type="submit">Sair</button>
        </form>
      </header>

      {traces.length === 0 ? (
        <p>Nenhum trace ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Gatilho</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Início</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr key={t.id}>
                <td>{t.root_trigger}</td>
                <td>{t.status}</td>
                <td>{t.started_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
