import { validateCredentialInput, type CredentialFieldErrors } from "./validate";
import type { CredentialInput, CredentialRecord, IntegrationProvider } from "./types";

/**
 * Guardar a credencial de uma integração.
 *
 * Portas-e-adaptadores como o resto do domínio: o repositório e a cifra são
 * injetados, e é por isso que este ficheiro — onde vive a regra que impede a
 * senha em claro de chegar à base de dados — se testa sem Supabase e sem
 * `CREDENTIALS_ENC_KEY`.
 */

export interface CredentialRepo {
  findByTeamProvider(
    teamId: string,
    provider: IntegrationProvider,
  ): Promise<{ id: string; hasSecret: boolean } | null>;
  insert(record: CredentialRecord): Promise<{ id: string }>;
  update(id: string, record: CredentialRecord): Promise<{ found: boolean }>;
}

/** Porta de cifra: mantém a chave-mestra fora do domínio. */
export interface SecretCipher {
  encrypt(plaintext: string): string;
}

export type CredentialServiceOutput =
  | { ok: true; id: string; created: boolean }
  | { ok: false; fieldErrors?: CredentialFieldErrors; error?: string };

/** Campos exigidos sempre, independentemente de haver ou não segredo guardado. */
function validateBase(input: CredentialInput): CredentialFieldErrors | null {
  const errors = validateCredentialInput(input);
  if (!errors) return null;
  const base: CredentialFieldErrors = { ...errors };
  delete base.password;
  return Object.keys(base).length > 0 ? base : null;
}

/**
 * Upsert por `(teamId, provider)`.
 *
 * Uma senha vazia num update **preserva** o segredo guardado: o formulário
 * nunca reexibe a senha, logo não a pode reenviar. Isso é sinalizado ao
 * adaptador com `secretEncrypted: null`, que significa "não toques nessa
 * coluna" — distinto de "grava null".
 */
export async function saveCredential(
  repo: CredentialRepo,
  cipher: SecretCipher,
  input: CredentialInput,
): Promise<CredentialServiceOutput> {
  // Antes de qualquer I/O: entrada obviamente inválida não merece uma query.
  const baseErrors = validateBase(input);
  if (baseErrors) return { ok: false, fieldErrors: baseErrors };

  const current = await repo.findByTeamProvider(input.teamId.trim(), input.provider);

  // Sem linha, ou com linha mas sem segredo, a senha é obrigatória.
  const requirePassword = !current || !current.hasSecret;
  const errors = validateCredentialInput(input, { requirePassword });
  if (errors) return { ok: false, fieldErrors: errors };

  const password = input.password ?? "";
  let secretEncrypted: string | null = null;
  if (password) {
    try {
      secretEncrypted = cipher.encrypt(password);
    } catch {
      // A mensagem do erro de cifra é uma constante fixa (ver @toc/core/crypto),
      // mas não a reencaminhamos: quem chama traduz para o utilizador.
      return { ok: false, error: "Não foi possível guardar a credencial com segurança." };
    }
  }

  const record: CredentialRecord = {
    teamId: input.teamId.trim(),
    provider: input.provider,
    username: input.username.trim().toLowerCase(),
    secretEncrypted,
    status: input.status ?? "active",
    metadata: input.metadata ?? {},
  };

  if (!current) {
    const { id } = await repo.insert(record);
    return { ok: true, id, created: true };
  }

  const { found } = await repo.update(current.id, record);
  if (!found) return { ok: false, error: "Credencial não encontrada." };
  return { ok: true, id: current.id, created: false };
}
