import type { Page } from "playwright";
import { AT } from "./selectors";
import { WORDING } from "./wording";

/**
 * "Em que página é que eu estou?" — a pergunta que o adaptador da AT faz a
 * seguir a cada navegação, respondida por uma função **pura**.
 *
 * Pura porque é aqui que mora o risco: um portal server-rendered responde 200 a
 * quase tudo, incluindo ao formulário de login que aparece quando a sessão
 * morre a meio. Sem classificação explícita, o adaptador continuaria a
 * preencher campos que não existem e a falhar com um timeout que não diz nada.
 * Sendo pura, cada desfecho tem um snapshot sintético no teste e não é preciso
 * um browser — nem o portal real — para provar a precedência.
 *
 * `snapshotPage` é a única função deste módulo que toca no Playwright, e só lê.
 */

/** O que se guarda de uma página. Nunca valores de campos — só nomes e tipos. */
export interface AtPageSnapshot {
  url: string;
  title: string;
  text: string;
  forms: { fields: { name: string; type: string }[] }[];
  /** Só existe se o chamador tiver a `Response` da navegação (ver `snapshotPage`). */
  status?: number;
}

export type AtPageKind =
  | { kind: "login_form" }
  | { kind: "login_rejected"; attemptsLeft: number | null }
  | { kind: "mfa_challenge" }
  | { kind: "password_change" }
  | { kind: "password_blocked" }
  | { kind: "authorization_missing" }
  | { kind: "client_select" }
  | { kind: "declaration_list" }
  | { kind: "declaration_none" }
  | { kind: "payment_document" }
  | { kind: "payment_document_none" }
  | { kind: "already_paid" }
  | { kind: "not_ready" }
  | { kind: "maintenance" }
  | { kind: "server_error" }
  | { kind: "unknown" };

/** Minúsculas e sem acentos: para as comparações por substring, não para as regexes. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** O host, ou `null` se a URL não for legível — nunca lança. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function allFields(snapshot: AtPageSnapshot): { name: string; type: string }[] {
  return snapshot.forms.flatMap((form) => form.fields);
}

/** Um campo de senha é o sinal mais fiável de "isto é um ecrã de autenticação". */
function hasPasswordField(snapshot: AtPageSnapshot): boolean {
  return allFields(snapshot).some(
    (field) => field.type.toLowerCase() === "password" || /senha|palavra.?passe/i.test(field.name),
  );
}

/** Um campo de NIF é o sinal do ecrã de escolha de cliente do contabilista. */
function hasNifField(snapshot: AtPageSnapshot): boolean {
  return allFields(snapshot).some((field) => /nif|contribuinte/i.test(field.name));
}

/**
 * Classifica a página. **A ordem é a regra**, e é esta:
 *
 * 1. `status >= 500` ou redação de erro de servidor → `server_error`. Primeiro
 *    de todos porque um 5xx pode vir com qualquer corpo, incluindo o formulário
 *    de login — e classificá-lo como recusa marcaria a credencial.
 * 2. Manutenção → `maintenance`. Também vence a leitura do conteúdo: a AT serve
 *    o aviso dentro do layout normal do portal.
 * 3. Contexto de autenticação (host do login **ou** um campo de senha à vista),
 *    do mais grave para o mais benigno: bloqueio → recusa → segundo fator →
 *    mudança de senha → e, se nada disso for **afirmado**, `login_form`. Os
 *    quatro primeiros exigem uma frase afirmativa (ver `wording.ts`): rótulos e
 *    links do próprio formulário nunca classificam nada, porque cada um deles
 *    dá `AtAuthError` e marca a credencial para todos os jobs seguintes.
 * 4. Contexto do portal: falta de autorização → sem declarações → já pago → sem
 *    documento → ainda não pronto → documento de pagamento → lista de
 *    declarações → e, por último, seleção de cliente. As negativas vêm antes
 *    das positivas porque a página de "não existe documento" continua a ter o
 *    título "Documento de pagamento"; e a seleção de cliente vem depois de tudo
 *    porque é a única que se decide pela estrutura da página e não pelo que ela
 *    diz.
 * 5. `unknown` — que o chamador regista com `fingerprint`, nunca ignora.
 */
export function classifyAtPage(
  snapshot: AtPageSnapshot,
  opts?: { loginHostPattern?: RegExp; portalHostPattern?: RegExp },
): AtPageKind {
  const loginHostPattern = opts?.loginHostPattern ?? AT.loginHostPattern;
  const portalHostPattern = opts?.portalHostPattern ?? AT.portalHostPattern;
  const text = snapshot.text;
  const flat = plain(text);
  const host = hostOf(snapshot.url);

  // (1) Erro de servidor.
  if ((snapshot.status !== undefined && snapshot.status >= 500) || WORDING.serverError.test(text)) {
    return { kind: "server_error" };
  }

  // (2) Manutenção.
  if (WORDING.maintenance.test(text)) return { kind: "maintenance" };

  // (3) Ecrã de autenticação.
  const onLoginHost = host !== null && loginHostPattern.test(host);
  if (onLoginHost || hasPasswordField(snapshot)) {
    if (WORDING.passwordBlocked.test(text)) return { kind: "password_blocked" };
    if (WORDING.loginRejected.test(text)) {
      const found = WORDING.attemptsLeft.exec(text);
      const digits = found?.[1];
      return { kind: "login_rejected", attemptsLeft: digits === undefined ? null : Number(digits) };
    }
    if (WORDING.mfa.test(text)) return { kind: "mfa_challenge" };
    if (WORDING.passwordChange.test(text)) return { kind: "password_change" };
    return { kind: "login_form" };
  }

  // (4) Já dentro do portal.
  if (host !== null && portalHostPattern.test(host)) {
    if (WORDING.authorizationMissing.test(text)) return { kind: "authorization_missing" };

    if (WORDING.noDeclaration.test(text)) return { kind: "declaration_none" };
    if (WORDING.alreadyPaid.test(text)) return { kind: "already_paid" };
    if (WORDING.noPaymentDocument.test(text)) return { kind: "payment_document_none" };
    if (WORDING.notReady.test(text)) return { kind: "not_ready" };

    if (
      flat.includes("documento de pagamento") &&
      (flat.includes("entidade") || flat.includes("referencia"))
    ) {
      return { kind: "payment_document" };
    }
    if (flat.includes("declara") && (flat.includes("periodo") || flat.includes("per."))) {
      return { kind: "declaration_list" };
    }

    // `client_select` fica para o fim porque é a única regra do portal que se
    // decide pela ESTRUTURA (um campo `nif` num form) e não pelo conteúdo — e a
    // estrutura é o mais fraco dos dois sinais. Um campo `nif` escondido na
    // página da guia é banal; a correr primeiro, esta regra dava a guia por
    // ecrã de escolha de cliente e o PDF nunca chegava a ser capturado.
    if (hasNifField(snapshot)) return { kind: "client_select" };
  }

  // (5) Não se arrisca um palpite.
  return { kind: "unknown" };
}

/**
 * Fotografa a página para classificação.
 *
 * A função passada ao `evaluate` **corre dentro do browser**: o Playwright
 * serializa-a com `toString()`, portanto não pode referir nada do escopo do
 * módulo (regra de `toconline/project-grid.ts`). Os únicos nomes que lá dentro
 * aparecem são globais do browser, o parâmetro serializado e tipos locais — que
 * o TypeScript apaga na compilação e nunca chegam ao `toString()`.
 *
 * `status` fica por preencher: um `Page` não sabe com que código HTTP foi
 * servido. Quem tem essa informação é quem chamou o `goto` e tem a `Response` —
 * daí `{ ...await snapshotPage(page), status: response?.status() }`.
 */
export async function snapshotPage(page: Page, maxChars = 4000): Promise<AtPageSnapshot> {
  const url = page.url();
  const title = await page.title();

  const collected = await page.evaluate((limit: number) => {
    type El = {
      getAttribute: (name: string) => string | null;
      tagName: string;
      querySelectorAll: (selector: string) => ArrayLike<El>;
    };
    type Scope = { querySelectorAll: (selector: string) => ArrayLike<El> };
    type Doc = Scope & { body: { innerText?: string; textContent?: string | null } | null };

    const doc = (globalThis as unknown as { document: Doc }).document;
    const body = doc.body;
    const text = (body ? (body.innerText ?? body.textContent) : "") ?? "";

    // Nunca `el.value`: um snapshot é para diagnóstico, e a senha está lá.
    const describe = (scope: Scope): { name: string; type: string }[] =>
      Array.from(scope.querySelectorAll("input, select, textarea")).map((el) => ({
        name: el.getAttribute("name") ?? el.getAttribute("id") ?? "",
        type: el.getAttribute("type") ?? el.tagName.toLowerCase(),
      }));

    const forms = Array.from(doc.querySelectorAll("form")).map((form) => ({
      fields: describe(form),
    }));

    return {
      text: text.slice(0, limit),
      // Campos fora de qualquer `<form>` continuam a ser campos: sem isto, uma
      // página de login sem `<form>` passaria por página desconhecida.
      forms: forms.length > 0 ? forms : [{ fields: describe(doc) }],
    };
  }, maxChars);

  return { url, title, text: collected.text, forms: collected.forms };
}

/** Sequências de dígitos fora: NIFs, valores, referências e datas. */
function maskDigits(text: string): string {
  return text.replace(/\d+/g, "#");
}

/**
 * A assinatura redigida de uma página, para o log de `unknown`.
 *
 * Serve uma pergunta só — "isto ainda é a página que eu conhecia?" — e por isso
 * dá para guardar sem guardar o portal: sem query string (que na AT leva NIFs),
 * sem dígitos, sem valores de campos, e com o texto cortado às primeiras cinco
 * linhas. O que sobra chega para reconhecer uma mudança de layout; não chega
 * para reconstruir a guia de ninguém.
 */
export function fingerprint(snapshot: AtPageSnapshot): Record<string, unknown> {
  const host = hostOf(snapshot.url);
  const fields = allFields(snapshot);
  return {
    host: host === null ? null : maskDigits(host),
    title: maskDigits(snapshot.title).trim(),
    text: snapshot.text
      .split("\n")
      .map((line) => maskDigits(line).trim())
      .filter((line) => line !== "")
      .slice(0, 5)
      .map((line) => line.slice(0, 60)),
    fields: fields.map((field) => `${maskDigits(field.name)}:${maskDigits(field.type)}`),
    hasPasswordField: hasPasswordField(snapshot),
    hasNifField: hasNifField(snapshot),
  };
}
