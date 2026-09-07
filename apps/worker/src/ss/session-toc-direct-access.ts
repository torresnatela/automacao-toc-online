import type { PersistentContextProvider } from "../browser/persistent-chromium";
import type { AtPageSnapshot } from "../at/classify-page";
import { fingerprint } from "../at/classify-page";
import {
  TocDirectAccessAtSessions,
  type DirectAccessPortal,
  type TocDirectAccessOptions,
} from "../at/session-toc-direct-access";
import { AtAuthError, AtIntegrityError, AtTransientError } from "../errors";
import type { AtCompanyHandle } from "../runner/ports";
import { SS, TOC_DIRECT_ACCESS_SS } from "./selectors";

/**
 * Rota A para a **Segurança Social Direta**: o mesmo percurso do Portal das
 * Finanças — sessão do TOConline, empresa vestida, cofre em `/vault-actions`,
 * clique na entidade, separador aberto pela extensão — mas na entidade
 * «Segurança Social». Tudo o que é partilhado vive em
 * `at/session-toc-direct-access.ts`; aqui só está o que muda de portal.
 *
 * A senha da SS, como a da AT, **nunca passa por aqui**: está no cofre do
 * TOConline e é a extensão que a escreve no formulário da SSD.
 *
 * TODO(recon): a guarda de pertença e a leitura do login são palpite até à
 * Fase 0 na SSD real (feita com o operador presente).
 */
export const SS_PORTAL: DirectAccessPortal = {
  label: TOC_DIRECT_ACCESS_SS.label,
  entity: TOC_DIRECT_ACCESS_SS.entity,
  entityValid: TOC_DIRECT_ACCESS_SS.entityValid,
  vaultKey: TOC_DIRECT_ACCESS_SS.vaultKey,
  portalOrigin: SS.portalOrigin,
  portalHostPattern: SS.portalHostPattern,
  cookieDomainPattern: SS.cookieDomainPattern,
  loginError: (snapshot) => ssLoginErrorFrom(snapshot),
  assertBelongs: (pageText, company) => assertSsSessionBelongsTo(pageText, company),
  // Login e portal no mesmo host: só se aterrou quando o caminho já não é o do
  // login (`/sso/…`). TODO(recon): confirmar os caminhos reais da SSD.
  landed: (url) => !SS.loginPathPattern.test(url.pathname),
  // A SSD navega-se por menus, não por URL: o fetcher não usa estes caminhos.
  // Ficam na origem para a sessão cumprir o contrato sem inventar rotas.
  urls: (portalOrigin) => ({
    consultarDeclaracao: portalOrigin,
    obterDocumentoPagamento: portalOrigin,
  }),
};

/**
 * O que ficou pelo caminho quando o separador da extensão não aterrou na SSD.
 * Senha recusada é estrutural (não se martela uma senha errada); o resto é
 * transitório, com a assinatura da página para se perceber o que mudou.
 */
export function ssLoginErrorFrom(snapshot: AtPageSnapshot): Error {
  const texto = snapshot.text;
  if (/(?:senha|palavra-passe|password)[^.]{0,60}(?:inv[áa]lid|incorret|errad)/i.test(texto)) {
    return new AtAuthError("rejected");
  }
  if (/(?:acesso|conta|utilizador)[^.]{0,40}bloquead/i.test(texto)) {
    return new AtAuthError("blocked");
  }
  if (/c[óo]digo[^.]{0,40}(?:sms|telem[óo]vel|autentica[çc][ãa]o)/i.test(texto)) {
    return new AtAuthError("two_factor");
  }
  if (snapshot.status !== undefined && snapshot.status >= 500) {
    return new AtTransientError("at_unavailable", "A Segurança Social Direta respondeu com erro de servidor.");
  }
  return new AtIntegrityError(
    "at_unexpected_page",
    "O separador aberto pela extensão não aterrou na Segurança Social Direta.",
    fingerprint(snapshot),
  );
}

/**
 * A sessão é da empresa certa? Só bloqueia quando a página **afirma** um NIF
 * diferente do esperado: a SSD identifica o titular pelo NISS, e o NIF pode
 * não estar à vista. Ausente não é prova de nada.
 */
export function assertSsSessionBelongsTo(pageText: string, company: AtCompanyHandle): void {
  if (company.nif === null) return;
  const nif = SS.wording.nif.exec(pageText)?.[1];
  if (nif === undefined || nif === company.nif) return;
  throw new AtIntegrityError(
    "at_session_mismatch",
    "A Segurança Social Direta abriu com a sessão de outro contribuinte.",
  );
}

export class TocDirectAccessSsSessions extends TocDirectAccessAtSessions {
  constructor(deps: { persistent: PersistentContextProvider }, options: TocDirectAccessOptions = {}) {
    super(deps, options, SS_PORTAL);
  }
}
