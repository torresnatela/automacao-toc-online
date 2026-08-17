import { describe, it, expect } from "vitest";
import { resolveTeamScope, type ActorScope } from "../../src/auth/team-scope";

const TEAM_A = "11111111-1111-1111-1111-111111111111";
const TEAM_B = "22222222-2222-2222-2222-222222222222";

const admin: ActorScope = { role: "admin", teamId: null };
const operador: ActorScope = { role: "operator", teamId: TEAM_A };
const viewer: ActorScope = { role: "viewer", teamId: TEAM_A };

describe("resolveTeamScope", () => {
  it("sem sessão é 401, não 403 — confundi-los esconde um problema de permissões", () => {
    expect(resolveTeamScope(null, TEAM_A)).toEqual({
      ok: false,
      status: 401,
      error: "Não autenticado.",
    });
  });

  it("papel abaixo do mínimo é 403", () => {
    const r = resolveTeamScope(viewer, TEAM_A);
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("o admin escolhe a equipa que pediu", () => {
    expect(resolveTeamScope(admin, TEAM_B)).toEqual({ ok: true, teamId: TEAM_B });
  });

  it("o admin sem equipa escolhida é 400 — não se adivinha por ele", () => {
    expect(resolveTeamScope(admin, "")).toMatchObject({ ok: false, status: 400 });
  });

  it("o operador fica preso à sua equipa, mesmo pedindo outra", () => {
    // O pedido é ignorado, não recusado: a UI nem lhe oferece a escolha, e
    // recusar transformaria um pedido malformado num erro que ele não provocou.
    expect(resolveTeamScope(operador, TEAM_B)).toEqual({ ok: true, teamId: TEAM_A });
  });

  it("operador sem equipa atribuída é 400 com a razão dele, não a do admin", () => {
    const r = resolveTeamScope({ role: "operator", teamId: null }, TEAM_A);
    expect(r).toEqual({
      ok: false,
      status: 400,
      error: "Seu usuário não está atribuído a uma equipe.",
    });
  });

  it("o mínimo de papel é parametrizável", () => {
    expect(resolveTeamScope(operador, TEAM_A, "admin")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(resolveTeamScope(viewer, TEAM_A, "viewer")).toEqual({ ok: true, teamId: TEAM_A });
  });
});
