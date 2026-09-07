/**
 * As redações do **TOConline** que decidem o Acesso Direto antes de se tocar
 * na AT — o único ficheiro com regexes do TOConline para a rota A, pelo mesmo
 * motivo de `wording.ts`: quando a aplicação reescrever uma frase corrige-se
 * aqui, sem tocar na precedência nem nos testes que a provam.
 *
 * A página do Sumário é Polymer em Shadow DOM: `innerText` não a atravessa, e
 * por isso o adaptador **não** usa `snapshotPage`. Sonda cada padrão com o
 * motor de texto do Playwright (`getByText`, que atravessa shadow roots) e
 * entrega os sinais a `classifyDirectAccessSignals`. `classifyDirectAccessText`
 * é a mesma decisão sobre um texto já colhido — serve aos testes e a qualquer
 * página que não seja shadow DOM.
 *
 * Regra herdada de `wording.ts`: **o aviso exige uma frase afirmativa**. "Senhas
 * da empresa" é um menu; "Extensões" é um menu; nenhum deles é um problema.
 */
export const DIRECT_ACCESS_WORDING = {
  /**
   * O TOConline convida a instalar a extensão: ela não está neste browser.
   * // observado em: TODO(recon)
   */
  extensionMissing:
    /instal\w*[^.]{0,30}extens[aã]o|extens[aã]o[^.]{0,40}(?:n[aã]o (?:est[aá] )?instalada|em falta|necess[aá]ria)|adicionar ao chrome/i,
  /**
   * A senha da empresa para o portal não está gravada no TOConline.
   * // observado em: TODO(recon)
   */
  passwordNotConfigured:
    /senha\w*[^.]{0,40}(?:n[aã]o (?:est[aá]|se encontra|foi)[^.]{0,20}(?:configurad|gravad|registad|definid)|por (?:configurar|gravar|registar))|n[aã]o (?:existe|h[aá]) (?:senha|informa[çc][aã]o de acesso)/i,
  /** O menu do Acesso Direto, com ou sem a grafia antiga. */
  directAccessMenu: /acesso dire[ct]?to/i,
} as const;

export type DirectAccessPageKind =
  | "extension_missing"
  | "password_not_configured"
  | "ready"
  | "unknown";

/** O que se observou na página, já reduzido a sim/não por padrão. */
export interface DirectAccessSignals {
  extensionMissing: boolean;
  passwordNotConfigured: boolean;
  menuVisible: boolean;
}

/**
 * A precedência: sem extensão nada funciona (ganha a tudo); sem senha o
 * Acesso Direto abre e falha na AT (ganha ao menu); o menu à vista sem avisos
 * é o caso normal; e o resto é desconhecido — **nunca** `ready` por omissão.
 */
export function classifyDirectAccessSignals(signals: DirectAccessSignals): DirectAccessPageKind {
  if (signals.extensionMissing) return "extension_missing";
  if (signals.passwordNotConfigured) return "password_not_configured";
  if (signals.menuVisible) return "ready";
  return "unknown";
}

/** A mesma decisão sobre um texto já colhido. */
export function classifyDirectAccessText(text: string): DirectAccessPageKind {
  return classifyDirectAccessSignals({
    extensionMissing: DIRECT_ACCESS_WORDING.extensionMissing.test(text),
    passwordNotConfigured: DIRECT_ACCESS_WORDING.passwordNotConfigured.test(text),
    menuVisible: DIRECT_ACCESS_WORDING.directAccessMenu.test(text),
  });
}
