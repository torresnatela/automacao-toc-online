import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listTeams, createTeamFromInput, teamInputFrom } from "@/lib/teams/service";

// GET /api/teams — equipes visíveis (RLS: própria + admin todas).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const data = await listTeams();
  return NextResponse.json({ ok: true, data });
}

// POST /api/teams — cria equipe (admin).
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const result = await createTeamFromInput(teamInputFrom(body as Record<string, unknown>));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, fieldErrors: result.fieldErrors },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, data: { id: result.id } }, { status: 201 });
}
