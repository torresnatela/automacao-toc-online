/**
 * O ÚNICO ficheiro com as redações do Portal das Finanças.
 *
 * Separado de `classify-page.ts` de propósito: quando a AT reescrever uma
 * mensagem — e vai — corrige-se **aqui**, sem tocar na lógica de precedência
 * nem nos testes que a provam. Cada padrão leva o comentário de onde foi
 * observado; enquanto disser `TODO(recon)` é palpite por confirmar na Fase 0.
 *
 * A regra que atravessa o ficheiro todo (a mesma de `toconline/session.ts`):
 * **a recusa exige uma frase afirmativa.** Um formulário nu, com os rótulos
 * "Utilizador" e "Senha" à vista e sem aviso nenhum, nunca é uma recusa — é um
 * formulário. Errar para esse lado marcaria uma credencial boa como inválida e
 * mataria todos os jobs seguintes na pré-condição; errar para o outro custa uma
 * tentativa retentável. A escolha é fácil.
 *
 * Todos os padrões são deliberadamente tolerantes a acentos (`[çc]`, `[aã]`):
 * o texto chega de `innerText`, de PDFs e de páginas com codificações
 * inconsistentes, e um acento perdido não pode mudar um desfecho.
 */
export const WORDING = {
  /** Recusa explícita da autenticação. // observado em: TODO(recon) */
  loginRejected: /erro na tentativa de autentica[çc][aã]o/i,
  /** Contador de tentativas que a AT anuncia ao recusar. // observado em: TODO(recon) */
  attemptsLeft: /tem mais (\d+) tentativa/i,
  /**
   * Conta trancada — só se destranca por carta, ~5 dias.
   * Uma frase só ("a senha está bloqueada"), com o limite de frase de sempre.
   * // observado em: TODO(recon)
   */
  passwordBlocked: /(?:senha|palavra-passe|acesso)[^.]{0,40}bloquead[oa]/i,
  /**
   * Segundo fator **pedido**, não oferecido.
   *
   * Exige um verbo na mesma frase ("introduza", "foi enviado") ou uma afirmação
   * de obrigatoriedade. Um botão "Autenticar com Chave Móvel Digital" ou um
   * captcha rotulado "Código de segurança" são opções do formulário, não um
   * desafio em curso — e classificá-los como 2FA dá `AtAuthError(two_factor)`,
   * que expira a credencial para todos os jobs seguintes.
   * // observado em: TODO(recon)
   */
  mfa: /introduza[^.]{0,60}c[oó]digo|c[oó]digo (?:de (?:seguran[çc]a|verifica[çc][aã]o) )?(?:foi )?enviado|autentica[çc][aã]o (?:de|em) dois (?:fatores|passos)[^.]{0,40}(?:obrigat|necess|introduza)/i,
  /**
   * Senha expirada ou mudança **imposta** — nunca o link "Alterar
   * palavra-passe" que vive no rodapé de qualquer formulário de login.
   * // observado em: TODO(recon)
   */
  passwordChange:
    /(?:senha|palavra-passe)[^.]{0,40}(?:expirou|caducou)|(?:deve|tem de|é necessário)[^.]{0,40}alterar[^.]{0,30}(?:senha|palavra-passe)/i,
  /** O contabilista não está autorizado por este contribuinte. // observado em: TODO(recon) */
  authorizationMissing: /n[aã]o (?:tem|possui|est[aá]) autoriza|sem autoriza[çc][aã]o|n[aã]o est[aá] autorizado/i,
  /** Não há guia a emitir — desfecho válido, não falha. // observado em: TODO(recon) */
  noPaymentDocument:
    /n[aã]o (?:existe|h[aá]) documento de pagamento|sem documento de pagamento|n[aã]o h[aá] lugar a pagamento|sem imposto a pagar/i,
  /**
   * Já pago: também é sucesso, e sem PDF a guardar.
   *
   * O `\b` não é higiene — sem ele, `pag[ao]` casa dentro de "pagou" e de
   * "pagamento", e o rodapé "Se já pagou este documento, ignore" que a própria
   * guia traz classificava a página como paga. O PDF nunca chegava a ser
   * capturado. // observado em: TODO(recon)
   */
  alreadyPaid: /j[aá] (?:foi )?pag[ao]\b|pagamento (?:j[aá] )?efetuado\b/i,
  /** Ainda em validação: volta-se cá noutro dia. // observado em: TODO(recon) */
  notReady: /em (?:valida[çc][aã]o|processamento)|ainda n[aã]o (?:est[aá] )?dispon[ií]vel/i,
  /** A consulta não devolveu declarações nenhumas. // observado em: TODO(recon) */
  noDeclaration: /n[aã]o (?:existem|foram encontradas|h[aá]) declara[çc][oõ]es/i,
  /** Portal em baixo por manutenção — retentável. // observado em: TODO(recon) */
  maintenance: /em manuten[çc][aã]o|temporariamente indispon[ií]vel/i,
  /** 5xx escrito por extenso, quando o status não chega até nós. // observado em: TODO(recon) */
  serverError: /erro (?:interno|inesperado) (?:do|no) servidor|http 5\d\d/i,
} as const;
