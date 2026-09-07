import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listTeams } from "@/lib/teams/service";
import { getTeamCredential } from "@/lib/integrations/service";
import { PageHeader } from "@/components/patterns/page-header";
import { CredentialForm } from "@/components/integrations/credential-form";
import { saveAtCredentialAction, deleteAtCredentialAction } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ team?: string }>;
}

/**
 * Credencial do gabinete no Portal das Finanças (rota B do Módulo 1).
 *
 * É a credencial do **Contabilista Certificado**, ao nível da equipa: uma só
 * para todas as empresas. Cada login errado gasta uma das poucas tentativas que
 * o portal concede antes de bloquear a conta por dias — daí a validação do NIF
 * ser feita antes de qualquer coisa tocar no portal.
 */
export default async function AtPage({ searchParams }: PageProps) {
  const user = await requireRole("operator");
  if (!user) redirect("/");

  const isAdmin = user.role === "admin";
  const teams = isAdmin ? await listTeams() : [];

  // Mesmo padrão de `integracoes/toconline`: o admin é global (team_id nulo) e
  // escolhe a equipa pela query string; o operador fica preso à sua.
  const { team: requestedTeam } = await searchParams;
  const teamId = isAdmin ? (requestedTeam ?? teams[0]?.id ?? "") : (user.teamId ?? "");

  const credential = await getTeamCredential("at", teamId);

  return (
    <div>
      <PageHeader
        title="Autoridade Tributária"
        description="Acesso ao Portal das Finanças usado pela busca das guias de IVA."
      />

      <div className="grid gap-8">
        <CredentialForm
          provider="at"
          credential={credential}
          teams={teams}
          isAdmin={isAdmin}
          teamId={teamId}
          saveAction={saveAtCredentialAction}
          deleteAction={deleteAtCredentialAction}
          teamHref="/integracoes/at"
          copy={{
            title: "Acesso à Autoridade Tributária",
            description:
              "Credencial do Contabilista Certificado do gabinete no Portal das Finanças. Guardada cifrada; a palavra-passe nunca é mostrada de volta. É a que o «Buscar» usa (login direto na AT); o «Buscar via TOConline» entra com a ligação ao TOConline.",
            usernameLabel: "NIF do Contabilista Certificado",
            usernameType: "text",
            usernameInputMode: "numeric",
            usernameAutoComplete: "username",
            connectLabel: "Guardar acesso à AT",
            savedMessage: "Acesso à AT guardado.",
            removeWarning:
              "Sem esta credencial a busca de guias de IVA deixa de funcionar para todas as empresas.",
          }}
        />
      </div>
    </div>
  );
}
