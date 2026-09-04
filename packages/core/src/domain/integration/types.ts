/**
 * Credenciais de integração — hoje só o TOConline, mas a forma já é a que
 * serve AT, Segurança Social e e-Fatura.
 *
 * A ordem das listas espelha os pgEnums `integration_provider` e
 * `credential_status` em `packages/db/src/schema/enums.ts`. Se um mudar, o
 * outro tem de mudar junto.
 */
export const INTEGRATION_PROVIDERS = ["toconline", "at", "seguranca_social", "efatura"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const CREDENTIAL_STATUSES = ["active", "expired", "invalid"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

/**
 * `credential_status` por extenso, no feminino (é sempre "a credencial").
 *
 * Vive no domínio e não no dashboard porque mais do que um ecrã o diz — o
 * formulário da credencial e o banner de prontidão da listagem de guias — e
 * duas cópias divergiriam. O `Record` obriga a completar o mapa em compilação.
 */
export const CREDENTIAL_STATUS_LABELS: Record<CredentialStatus, string> = {
  active: "ativa",
  expired: "expirada",
  invalid: "inválida",
};

/** Um estado que este build não conheça mostra-se tal como veio: melhor a
 * palavra crua do que uma frase que finge saber o que se passou. */
export function credentialStatusLabel(status: string): string {
  const known = CREDENTIAL_STATUSES.find((s) => s === status);
  return known === undefined ? status : CREDENTIAL_STATUS_LABELS[known];
}

export interface CredentialInput {
  /** A credencial do gabinete é da EQUIPA, não de uma empresa. */
  teamId: string;
  provider: IntegrationProvider;
  username: string;
  /**
   * Ausente ou vazia **num update** significa "manter o segredo já guardado" —
   * o formulário não reexibe a senha, logo não a pode reenviar. Num create é
   * obrigatória.
   */
  password?: string | null;
  status?: CredentialStatus;
  metadata?: Record<string, unknown>;
}

export interface CredentialRecord {
  teamId: string;
  provider: IntegrationProvider;
  username: string;
  /** `null` = não mexer na coluna do segredo (o adaptador omite-a do UPDATE). */
  secretEncrypted: string | null;
  status: CredentialStatus;
  metadata: Record<string, unknown>;
}
