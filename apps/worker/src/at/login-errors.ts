import { AtAuthError, AtIntegrityError, AtTransientError } from "../errors";
import { classifyAtPage, fingerprint, type AtPageSnapshot } from "./classify-page";

/**
 * O que a AT disse quando o login não chegou ao portal — a mesma tradução para
 * as duas rotas. Na B somos nós que submetemos o formulário; na A é a extensão
 * do TOConline. O ecrã em que se fica é o mesmo, e a leitura tem de ser a mesma.
 *
 * Cada ramo tem um custo diferente e é por isso que nenhum é o `else` do
 * outro: `AtAuthError` marca a credencial e mata os jobs seguintes na
 * pré-condição; `AtTransientError` volta à fila com backoff; e o desconhecido é
 * estrutural, com a assinatura redigida da página para se perceber o que mudou
 * sem guardar o portal. O formulário devolvido **sem aviso nenhum** é uma
 * avaria do portal, nunca uma recusa — tratá-lo como recusa marcaria uma
 * credencial boa.
 */
export function loginErrorFrom(
  snapshot: AtPageSnapshot,
  padroes: { loginHostPattern: RegExp; portalHostPattern: RegExp },
): Error {
  const pagina = classifyAtPage(snapshot, padroes);
  switch (pagina.kind) {
    case "login_rejected":
      return pagina.attemptsLeft === null
        ? new AtAuthError("rejected")
        : new AtAuthError("rejected", pagina.attemptsLeft);
    case "password_blocked":
      return new AtAuthError("blocked");
    case "mfa_challenge":
      return new AtAuthError("two_factor");
    case "password_change":
      return new AtAuthError("expired");
    case "login_form":
      return new AtTransientError(
        "at_unavailable",
        "A AT não concluiu o login dentro do tempo previsto.",
      );
    case "maintenance":
    case "server_error":
      return new AtTransientError(
        "at_unavailable",
        "O Portal das Finanças está indisponível de momento.",
      );
    default:
      return new AtIntegrityError(
        "at_unexpected_page",
        "O Portal das Finanças respondeu com uma página inesperada durante a autenticação.",
        fingerprint(snapshot),
      );
  }
}
