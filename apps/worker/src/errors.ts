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
