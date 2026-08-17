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
