import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface TraceRow {
  id: string;
  root_trigger: string;
  trigger_source: string | null;
  correlation_key: string | null;
  status: string;
  created_by: string | null;
  started_at: string;
  ended_at: string | null;
}

interface EventRow {
  id: string;
  parent_event_id: string | null;
  type: string;
  source: string;
  status: string;
  duration_ms: number | null;
  occurred_at: string;
}

interface LogRow {
  id: string;
  event_id: string | null;
  level: string;
  message: string;
  data: Record<string, unknown>;
  logged_at: string;
}

/** Renderiza a árvore causal de events, indentada por `parent_event_id`. */
function renderEventTree(events: EventRow[], parentId: string | null, depth: number) {
  return events
    .filter((e) => (e.parent_event_id ?? null) === parentId)
    .map((e) => (
      <Fragment key={e.id}>
        <tr>
          <td style={{ paddingLeft: 12 + depth * 20 }}>{e.type}</td>
          <td>{e.status}</td>
          <td>{e.source}</td>
          <td>{e.duration_ms ?? "—"}</td>
        </tr>
        {renderEventTree(events, e.id, depth + 1)}
      </Fragment>
    ));
}

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: trace } = await supabase
    .from("traces")
    .select("id, root_trigger, trigger_source, correlation_key, status, created_by, started_at, ended_at")
    .eq("id", traceId)
    .maybeSingle();
  if (!trace) notFound();
  const t = trace as TraceRow;

  const { data: eventsData } = await supabase
    .from("events")
    .select("id, parent_event_id, type, source, status, duration_ms, occurred_at")
    .eq("trace_id", traceId)
    .order("occurred_at", { ascending: true });
  const events = (eventsData ?? []) as EventRow[];

  const { data: logsData } = await supabase
    .from("logs")
    .select("id, event_id, level, message, data, logged_at")
    .eq("trace_id", traceId)
    .order("logged_at", { ascending: true });
  const logs = (logsData ?? []) as LogRow[];

  return (
    <section>
      <p>
        <Link href="/logs">← Logs</Link>
      </p>
      <h1>Trace {t.root_trigger}</h1>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", maxWidth: 640 }}>
        <dt>Status</dt>
        <dd>{t.status}</dd>
        <dt>Origem</dt>
        <dd>{t.trigger_source ?? "—"}</dd>
        <dt>Correlação</dt>
        <dd>{t.correlation_key ?? "—"}</dd>
        <dt>Usuário</dt>
        <dd>{t.created_by ?? "—"}</dd>
        <dt>Início</dt>
        <dd>{t.started_at}</dd>
        <dt>Fim</dt>
        <dd>{t.ended_at ?? "—"}</dd>
      </dl>

      <h2>Eventos</h2>
      {events.length === 0 ? (
        <p>Sem eventos.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Tipo</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Fonte</th>
              <th style={{ textAlign: "left" }}>Duração (ms)</th>
            </tr>
          </thead>
          <tbody>{renderEventTree(events, null, 0)}</tbody>
        </table>
      )}

      <h2>Logs</h2>
      {logs.length === 0 ? (
        <p>Sem logs.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Nível</th>
              <th style={{ textAlign: "left" }}>Mensagem</th>
              <th style={{ textAlign: "left" }}>Dados</th>
              <th style={{ textAlign: "left" }}>Momento</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.level}</td>
                <td>{l.message}</td>
                <td>
                  <code>{JSON.stringify(l.data)}</code>
                </td>
                <td>{l.logged_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
