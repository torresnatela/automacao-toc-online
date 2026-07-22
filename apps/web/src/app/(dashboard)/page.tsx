// Tela inicial: lista as integrações (sistemas de terceiros) que a automação usa.
// Estática por enquanto (espelha o enum `integration_provider`); evoluirá para
// agregar `integration_credentials` por cliente quando as integrações chegarem.

interface Integration {
  provider: string;
  label: string;
  description: string;
}

const INTEGRATIONS: Integration[] = [
  { provider: "toconline", label: "TOConline", description: "Plataforma central de contabilidade" },
  { provider: "at", label: "Autoridade Tributária (AT)", description: "Portal das Finanças" },
  { provider: "seguranca_social", label: "Segurança Social Direta", description: "SS Direta (2FA por utilizador dedicado)" },
  { provider: "efatura", label: "e-Fatura", description: "Faturação eletrónica" },
];

export default function IntegracoesPage() {
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
              <td>{i.label}</td>
              <td>{i.description}</td>
              <td>Não configurado</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
