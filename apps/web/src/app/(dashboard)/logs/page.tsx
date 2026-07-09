import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface TraceRow {
  id: string;
  root_trigger: string;
  status: string;
  correlation_key: string | null;
  started_at: string;
}

export default async function LogsPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("traces")
    .select("id, root_trigger, status, correlation_key, started_at")
    .order("started_at", { ascending: false })
    .limit(50);
  const traces = (data ?? []) as TraceRow[];

  return (
    <section>
      <h1>Logs</h1>
      <p>Cada trace é o contexto-raiz de um gatilho. Abra um para ver a cadeia de eventos e logs.</p>
      {traces.length === 0 ? (
        <p>Nenhum trace ainda.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Gatilho</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Correlação</th>
              <th style={{ textAlign: "left" }}>Início</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/logs/${t.id}`}>{t.root_trigger}</Link>
                </td>
                <td>{t.status}</td>
                <td>{t.correlation_key ?? "—"}</td>
                <td>{t.started_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
