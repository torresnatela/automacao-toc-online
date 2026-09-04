import type { CredentialFieldErrors } from "@toc/core/domain";

/**
 * Estado devolvido pelas ações de credencial (guardar/remover), igual para
 * todos os providers.
 *
 * Vive fora de `actions.ts` porque cada provider tem o seu ficheiro de ações e
 * um `CredentialForm` só — se cada `"use server"` declarasse o seu tipo, o
 * componente genérico teria de escolher um deles e os outros passariam a
 * depender do provider errado. E vive fora de `service.ts` porque este módulo é
 * importado por um Client Component: `service.ts` é `server-only`.
 *
 * Nunca leva o valor de nada que o utilizador escreveu — em particular, nunca
 * a palavra-passe. `fieldErrors` são mensagens do domínio, já em português.
 */
export interface CredentialFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: CredentialFieldErrors;
}
