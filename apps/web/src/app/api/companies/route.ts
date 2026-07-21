import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  listCompanies,
  createCompanyFromInput,
  companyInputFrom,
} from "@/lib/companies/service";

// GET /api/companies — lista as empresas visíveis ao usuário (RLS escopa por equipe).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const data = await listCompanies();
  return NextResponse.json({ ok: true, data });
}

// POST /api/companies — cria uma empresa (operator+).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Corpo deve ser um objeto." }, { status: 400 });
  }
  const result = await createCompanyFromInput(companyInputFrom(body as Record<string, unknown>));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, data: { id: result.id } }, { status: 201 });
}
