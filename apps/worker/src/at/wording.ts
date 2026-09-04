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
  /** Conta trancada — só se destranca por carta, ~5 dias. // observado em: TODO(recon) */
  passwordBlocked: /(senha|palavra-passe)[^.]{0,60}bloquead|acesso[^.]{0,40}bloqueado/i,
  /** Segundo fator pedido (SMS, e-mail ou Chave Móvel Digital). // observado em: TODO(recon) */
  mfa: /c[oó]digo (?:de seguran[çc]a|de verifica[çc][aã]o|enviado)|autentica[çc][aã]o (?:de|em) dois (?:fatores|passos)|chave m[oó]vel digital/i,
  /** Senha expirada ou mudança imposta. // observado em: TODO(recon) */
  passwordChange:
    /(?:alterar|renovar|definir)[^.]{0,60}(?:senha|palavra-passe)|(?:senha|palavra-passe)[^.]{0,60}(?:expirou|caducou)/i,
  /** O contabilista não está autorizado por este contribuinte. // observado em: TODO(recon) */
  authorizationMissing: /n[aã]o (?:tem|possui|est[aá]) autoriza|sem autoriza[çc][aã]o|n[aã]o est[aá] autorizado/i,
  /** Não há guia a emitir — desfecho válido, não falha. // observado em: TODO(recon) */
  noPaymentDocument:
    /n[aã]o (?:existe|h[aá]) documento de pagamento|sem documento de pagamento|n[aã]o h[aá] lugar a pagamento|sem imposto a pagar/i,
  /** Já pago: também é sucesso, e sem PDF a guardar. // observado em: TODO(recon) */
  alreadyPaid: /j[aá] (?:foi )?pag[ao]|pagamento efetuado/i,
  /** Ainda em validação: volta-se cá noutro dia. // observado em: TODO(recon) */
  notReady: /em (?:valida[çc][aã]o|processamento)|ainda n[aã]o (?:est[aá] )?dispon[ií]vel/i,
  /** A consulta não devolveu declarações nenhumas. // observado em: TODO(recon) */
  noDeclaration: /n[aã]o (?:existem|foram encontradas|h[aá]) declara[çc][oõ]es/i,
  /** Portal em baixo por manutenção — retentável. // observado em: TODO(recon) */
  maintenance: /em manuten[çc][aã]o|temporariamente indispon[ií]vel/i,
  /** 5xx escrito por extenso, quando o status não chega até nós. // observado em: TODO(recon) */
  serverError: /erro (?:interno|inesperado) (?:do|no) servidor|http 5\d\d/i,
} as const;
