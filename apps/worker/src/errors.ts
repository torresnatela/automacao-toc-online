/**
 * Erros do worker, classificados pela única pergunta que importa à fila:
 * **vale a pena tentar outra vez?**
 *
 * `JobQueue.fail(id, err, { retry })` decide o destino do job. A regra é
 * `retry = !(err instanceof StructuralError)`: falhas transitórias (rede,
 * timeout, 5xx) merecem backoff; falhas estruturais não. Retentar um seletor
 * partido ou uma senha errada só multiplica o dano e o tráfego contra o
 * portal de terceiro.
 */

/**
 * O mundo mudou de forma que o código não sabe tratar: seletor partido,
 * propriedade renomeada, página irreconhecível, contrato de dados diferente.
 * **Não é retentável** — pede intervenção humana.
 */
export class StructuralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuralError";
  }
}

/**
 * As credenciais foram rejeitadas pelo TOConline. Subclasse de
 * `StructuralError` de propósito: herda o "não retentar" (uma senha errada
 * não fica certa ao fim de três tentativas) e permite ao runner distinguir
 * este caso para marcar a credencial como inválida na base de dados.
 *
 * A mensagem nunca inclui a senha nem o utilizador.
 */
export class InvalidCredentialsError extends StructuralError {
  constructor(message = "Credenciais do TOConline rejeitadas.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

/** O que o Portal das Finanças disse **sobre a credencial** ao recusar a entrada. */
export type AtAuthReason =
  "rejected" | "blocked" | "expired" | "two_factor" | "authorization_missing";

/**
 * A autenticação na AT não passou.
 *
 * Estende `StructuralError` de propósito — herda o "nunca retentar", e aqui
 * isso não é higiene, é a salvaguarda central do Módulo 1: cada tentativa gasta
 * uma do contador da AT e a conta acaba bloqueada por dias (nova senha só por
 * carta, ~5 dias úteis). O `reason` é o que o runner usa para marcar a
 * credencial (`invalidate` / `expire`), e `attemptsLeft` o que a AT diz faltar.
 *
 * A mensagem é texto nosso: nunca o HTML do portal, o NIF ou a senha.
 */
export class AtAuthError extends StructuralError {
  constructor(
    readonly reason: AtAuthReason,
    readonly attemptsLeft?: number,
  ) {
    super("A Autoridade Tributária recusou a autenticação.");
    this.name = "AtAuthError";
  }
}

/** Códigos de `AtIntegrityError` — desfechos estruturais com nome próprio. */
export type AtIntegrityOutcome =
  | "at_session_mismatch"
  | "document_type_unexpected"
  | "document_fields_mismatch"
  | "direct_access_extension_missing"
  | "at_unexpected_page"
  | "toconline_unexpected_page";

/**
 * Uma guarda de integridade falhou ou o contrato do portal mudou.
 *
 * Estrutural (não retentável) e com código próprio, para o desfecho não cair no
 * genérico da etapa. O `fingerprint` é a assinatura redigida da página (dígitos
 * mascarados, sem query string) que permite reconhecer a mudança sem guardar o
 * conteúdo do portal.
 */
export class AtIntegrityError extends StructuralError {
  constructor(
    readonly outcome: AtIntegrityOutcome,
    message: string,
    readonly fingerprint?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AtIntegrityError";
  }
}

/** Códigos de `AtTransientError` — desfechos retentáveis com nome próprio. */
export type AtTransientOutcome =
  | "at_unavailable"
  | "toconline_unavailable"
  | "direct_access_failed"
  | "document_capture_failed"
  | "persist_failed";

/**
 * Falha passageira com código próprio: portal em baixo, download interrompido,
 * escrita que não foi.
 *
 * **Não** estende `StructuralError`, e é essa a única coisa que o distingue —
 * `retry = !(err instanceof StructuralError)` dá `true` e o job volta à fila
 * com backoff.
 */
export class AtTransientError extends Error {
  constructor(
    readonly outcome: AtTransientOutcome,
    message: string,
  ) {
    super(message);
    this.name = "AtTransientError";
  }
}
