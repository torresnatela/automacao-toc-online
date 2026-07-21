import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  DataTable,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/patterns/data-table";

export const dynamic = "force-dynamic";

interface TraceRow {
  id: string;
  root_trigger: string;
  status: string;
  started_at: string;
}

const dateFmt = new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
    <div>
      <PageHeader title="Traces" description="Execuções recentes e o seu estado." />

      {traces.length === 0 ? (
        <EmptyState
          icon={<Activity />}
          title="Nenhum trace ainda"
          description="Assim que um fluxo com efeito colateral rodar, ele aparece aqui."
        />
      ) : (
        <DataTable>
          <TableHeader>
            <TableRow>
              <TableHead>Gatilho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-foreground">{t.root_trigger}</TableCell>
                <TableCell>
                  <StatusBadge kind="trace" value={t.status} label={capitalize(t.status)} />
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(t.started_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </div>
  );
}
