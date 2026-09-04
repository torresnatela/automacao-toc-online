// Tela inicial: lista as integrações (sistemas de terceiros) que a automação usa.
// Ainda estática (espelha o enum `integration_provider`), com uma exceção: a AT,
// que já tem página própria e por isso já pode dizer a verdade sobre si mesma —
// as outras ficam "Não configurado" até ganharem a sua.

import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getTeamCredential } from "@/lib/integrations/service";

export const dynamic = "force-dynamic";

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

export default async function IntegracoesPage() {
  // O layout do dashboard já redireciona quem não tem sessão; aqui ela serve só
  // para saber de que equipa é o estado que se mostra.
  const user = await getSessionUser();
  const teams = user?.role === "admin" ? await listTeams() : [];
  // O admin é global (team_id nulo): vê a primeira equipa, que é a mesma que as
  // páginas de integração escolhem por omissão.
  const teamId = user?.teamId ?? teams[0]?.id ?? "";
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
