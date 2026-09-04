"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

export interface TeamSwitcherProps {
  teams: { id: string; name: string }[];
  /** Equipa que a página está a mostrar. */
  teamId: string;
  /**
   * Rota desta página, à qual se acrescenta `?team=`. É uma string e não
   * `(id) => string` porque quem monta isto é um Server Component, e uma função
   * comum não atravessa essa fronteira — rebentaria em execução.
   */
  basePath: string;
  /** Rótulo visível. Só muda quando a página já tem outro "Equipa" no ecrã. */
  label?: string;
}

/**
 * O seletor de equipa do admin — que é **global** (`team_id` nulo) e por isso
 * tem de escolher a equipa que está a ver.
 *
 * Troca de equipa navegando (`?team=`) e não por estado local: assim o estado
 * da página e o do seletor são o mesmo objeto (o URL), o botão «voltar» faz o
 * que se espera, e a listagem é sempre a que o servidor leu para aquela equipa.
 *
 * Não substitui o seletor do `CredentialForm`: lá o `<select name="teamId">` é
 * um campo do formulário — o seu valor viaja no `FormData` para a Server Action
 * — e aqui é só navegação. Uni-los daria a um deles um campo a mais ou a menos.
 */
export function TeamSwitcher({ teams, teamId, basePath, label = "Equipa" }: TeamSwitcherProps) {
  const router = useRouter();
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted-foreground text-sm whitespace-nowrap">
        {label}
      </label>
      <Select
        id={id}
        value={teamId}
        onChange={(e) => router.push(`${basePath}?team=${e.target.value}`)}
        className="w-auto min-w-40"
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
