// Tela inicial: lista as integrações (sistemas de terceiros) que a automação usa.
// Ainda estática (espelha o enum `integration_provider`), com uma exceção: a AT,
// que já tem página própria e por isso já pode dizer a verdade sobre si mesma —
// as outras ficam "Não configurado" até ganharem a sua.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getTeamCredential } from "@/lib/integrations/service";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ team?: string }>;
}

interface Integration {
  provider: string;
  label: string;
  description: string;
  /** Rota da página da credencial, quando já existe uma. */
  href?: string;
}

const INTEGRATIONS: Integration[] = [
  { provider: "toconline", label: "TOConline", description: "Plataforma central de contabilidade" },
  {
    provider: "at",
    label: "Autoridade Tributária (AT)",
    description: "Portal das Finanças",
    href: "/integracoes/at",
  },
  { provider: "seguranca_social", label: "Segurança Social Direta", description: "SS Direta (2FA por utilizador dedicado)" },
  { provider: "efatura", label: "e-Fatura", description: "Faturação eletrónica" },
];

export default async function IntegracoesPage({ searchParams }: PageProps) {
  // O layout do dashboard já redireciona quem não tem sessão; aqui ela serve só
  // para saber de que equipa é o estado que se mostra.
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const teams = isAdmin ? await listTeams() : [];

  // O admin é global (team_id nulo) e escolhe a equipa pela query string, como
  // em `/integracoes/at` e `/documentos/iva`: sem isto, esta página falava
  // sempre da primeira equipa e contradizia o ecrã para onde manda o operador.
  // O pedido só vale se for mesmo uma equipa existente — um `?team=` inventado
  // cairia numa leitura vazia indistinguível de "não configurado".
  const { team: requestedTeam } = await searchParams;
  const pedida = teams.find((team) => team.id === requestedTeam)?.id;
  const teamId = isAdmin ? (pedida ?? teams[0]?.id ?? "") : (user?.teamId ?? "");
  const atCredential = teamId === "" ? null : await getTeamCredential("at", teamId);

  // Sem equipa não há nada que se possa afirmar — e "Não configurado" seria uma
  // afirmação, além de falsa.
  const atStatus =
    teamId === "" ? "—" : atCredential?.has_secret ? "Configurado" : "Não configurado";

  return (
    <section>
      <h1>Integrações</h1>
      <p>Sistemas de terceiros que a automação utiliza no ciclo mensal de guias fiscais.</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Integração</th>
            <th style={{ textAlign: "left" }}>Descrição</th>
            <th style={{ textAlign: "left" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {INTEGRATIONS.map((i) => (
            <tr key={i.provider}>
              <td>{i.href ? <Link href={i.href}>{i.label}</Link> : i.label}</td>
              <td>{i.description}</td>
              <td>{i.provider === "at" ? atStatus : "Não configurado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
