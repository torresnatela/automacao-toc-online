import { ROLE_ORDER, type AppRole } from "./roles";

/**
 * Quem pode escrever e sobre que equipa.
 *
 * Vive no domínio, e não repetido em cada `service.ts` do dashboard, porque é
 * uma **decisão** — e decisões testam-se sem Next, sem Supabase e sem sessão. As
 * rotas ficam com o que resta: ler a sessão e traduzir o veredito em resposta.
 */

/** Estado mínimo do ator para decidir. Deliberadamente não é a sessão inteira. */
export interface ActorScope {
  role: AppRole;
  teamId: string | null;
}

export type TeamScope =
  | { ok: true; teamId: string }
  | { ok: false; status: 400 | 401 | 403; error: string };

/**
 * Resolve a equipa sobre a qual o ator vai escrever.
 *
 * O admin é global (`team_id` nulo) e por isso **escolhe** a equipa; o operador
 * fica preso à sua e o pedido dele é ignorado — não recusado — porque a UI nem
 * lho oferece. Sem sessão é 401, papel a menos é 403: são coisas diferentes, e
 * confundi-las esconde um problema de permissões atrás de um ecrã de login.
 */
export function resolveTeamScope(
  actor: ActorScope | null,
  requestedTeamId: string,
  minimumRole: AppRole = "operator",
): TeamScope {
  if (!actor) return { ok: false, status: 401, error: "Não autenticado." };

  if (ROLE_ORDER.indexOf(actor.role) < ROLE_ORDER.indexOf(minimumRole)) {
    return { ok: false, status: 403, error: "Acesso restrito a operador ou administrador." };
  }

  const teamId = actor.role === "admin" ? requestedTeamId : (actor.teamId ?? "");
  if (!teamId) {
    return {
      ok: false,
      status: 400,
      error:
        actor.role === "admin"
          ? "Selecione a equipe."
          : "Seu usuário não está atribuído a uma equipe.",
    };
  }
  return { ok: true, teamId };
}
