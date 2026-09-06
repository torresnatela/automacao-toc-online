import type { Page } from "playwright";
import { InvalidCredentialsError, StructuralError } from "../errors";
import type { TocOnlineCredentials } from "../runner/ports";
import { TOCONLINE } from "./selectors";

/**
 * O login no TOConline numa página já aberta — a parte que as duas rotas
 * partilham. `PlaywrightTocSessions` (Módulo 0, um contexto por job) e o
 * adaptador do Acesso Direto (rota A, perfil persistente) chegam ao mesmo
 * formulário com credenciais do mesmo sítio; só difere de onde vem a página e
 * o que se faz com a sessão depois.
 *
 * O detalhe que molda tudo: **o login redireciona para um host shardado**
 * (`app5.toconline.pt`, `app11…`), e o número varia por conta. Fixar o host
 * seria garantir uma quebra silenciosa quando a conta migrasse de servidor —
 * por isso ele é *derivado do redirect* e devolvido a quem chamou.
 */

export interface TocLoginOptions {
  loginUrl?: string;
  /** Injetável para o teste apontar a um servidor local. */
  hostPattern?: RegExp;
  timeoutMs?: number;
}

/** Valida e devolve o host efetivo. Lança se o redirect levou a sítio inesperado. */
export function assertTocHost(url: string, pattern: RegExp = TOCONLINE.hostPattern): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new StructuralError("URL inválida devolvida pelo TOConline após o login.");
  }
  if (!pattern.test(host)) {
    throw new StructuralError(
      `O TOConline redirecionou para um host inesperado (${host}). O fluxo de login mudou.`,
    );
  }
  return host;
}

/**
 * Substantivos que a página de login usa **por natureza**: são rótulos do
 * próprio formulário ("Palavra-passe", "Credenciais de acesso"), não prova de
 * recusa. Sozinhos não classificam nada.
 */
const CREDENCIAL =
  "credenciai\\w*|credentials|palavra-passe|password|utilizador|username|e-?mail|login|dados de acesso";
/** Adjetivos/verbos que afirmam a recusa. Sem um destes, não houve recusa. */
const RECUSA =
  "inv[aá]lid\\w*|invalid|incorret\\w*|incorrect|errad\\w*|wrong|n[aã]o (?:confere\\w*|coincide\\w*|corresponde\\w*)|failed|falhou";

/**
 * Só se afirma "rejeitada" quando a página junta um substantivo de credencial a
 * uma afirmação de recusa, na mesma frase (sem `.` a separar).
 *
 * A versão anterior procurava os substantivos isolados e classificava como
 * recusa qualquer timeout com o formulário à vista — marcando inválida uma
 * credencial boa e fazendo todos os jobs seguintes serem ignorados. Um timeout
 * sem indício visível é erro retentável, e é esse o lado seguro de errar.
 */
const REJECTION_NOTICE = new RegExp(
  `(?:(?:${CREDENCIAL})[^.]{0,40}?(?:${RECUSA}))|(?:(?:${RECUSA})[^.]{0,40}?(?:${CREDENCIAL}))`,
  "i",
);

/**
 * Procura por uma indicação visível de credencial recusada. Baseado em texto
 * e não num seletor porque o seletor exato é um achado da Fase 0 — e um
 * seletor errado falharia silenciosamente para o lado perigoso.
 */
export async function looksRejected(page: Page): Promise<boolean> {
  try {
    const aviso = page.getByText(REJECTION_NOTICE);
    return (await aviso.count()) > 0;
  } catch {
    return false;
  }
}

/**
 * Preenche e submete o formulário de login e espera por sair de `/login`.
 * Devolve o host shardado e a origem em que a aplicação aterrou.
 */
export async function loginOnPage(
  page: Page,
  credentials: TocOnlineCredentials,
  options: TocLoginOptions = {},
): Promise<{ host: string; origin: string }> {
  const timeout = options.timeoutMs ?? TOCONLINE.defaultTimeoutMs;

  await page.goto(options.loginUrl ?? TOCONLINE.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout,
  });

  await page.fill(TOCONLINE.usernameInput, credentials.username, { timeout });
  await page.fill(TOCONLINE.passwordInput, credentials.password, { timeout });
  await page.click(TOCONLINE.submitButton, { timeout });

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout });
  } catch {
    // Continuar na página de login é quase sempre credencial rejeitada, mas
    // não sempre — e classificar mal tem custo real: marcar inválida uma
    // credencial boa faz todos os jobs seguintes serem ignorados. Por isso só
    // se afirma "rejeitada" quando a página o diz.
    throw (await looksRejected(page))
      ? new InvalidCredentialsError()
      : new Error("O TOConline não concluiu o login dentro do tempo previsto.");
  }

  const host = assertTocHost(page.url(), options.hostPattern);
  return { host, origin: new URL(page.url()).origin };
}
