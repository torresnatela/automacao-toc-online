import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  getTeam,
  updateTeamFromInput,
  deleteTeam,
  teamInputFrom,
} from "@/lib/teams/service";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/teams/:id
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const data = await getTeam(id);
  if (!data) return NextResponse.json({ ok: false, error: "Equipe não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

// PATCH /api/teams/:id (admin)
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const result = await updateTeamFromInput(id, teamInputFrom(body as Record<string, unknown>));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, data: { id: result.id } });
}

// DELETE /api/teams/:id (admin)
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const result = await deleteTeam(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, data: { id: result.id } });
}
