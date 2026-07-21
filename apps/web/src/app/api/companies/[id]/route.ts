import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getCompany,
  updateCompanyFromInput,
  deleteCompany,
  companyInputFrom,
} from "@/lib/companies/service";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/companies/:id
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const data = await getCompany(id);
  if (!data) return NextResponse.json({ ok: false, error: "Empresa não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

// PATCH /api/companies/:id (operator+)
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const result = await updateCompanyFromInput(id, companyInputFrom(body as Record<string, unknown>));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, data: { id: result.id } });
}

// DELETE /api/companies/:id (operator+)
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await deleteCompany(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, data: { id: result.id } });
}
