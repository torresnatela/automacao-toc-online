import { redirect } from "next/navigation";

// A visualização de traces foi unificada em /logs (lista + drill-down).
export default function TracesPage() {
  redirect("/logs");
}
