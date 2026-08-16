/**
 * Seletores do TOConline, observados no reconhecimento de 2026-08-16 em
 * app.toconline.pt / app5.toconline.pt.
 *
 * Concentrados num ficheiro de propósito: quando o portal mudar — e vai —
 * muda-se aqui e mais nenhures.
 *
 * **XPath é proibido neste módulo.** A aplicação é Polymer e vive toda em
 * Shadow DOM aberto: o motor CSS do Playwright atravessa shadow roots, o XPath
 * não.
 */
export const TOCONLINE = {
  /** O login é sempre no host sem shard; o redirect pós-login é que revela o shard. */
  loginUrl: "https://app.toconline.pt/login",

  usernameInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  /**
   * O botão de entrar é `type="button"` (não `submit`), portanto não há form a
   * submeter — vai-se pelo texto, que é estável e legível.
   */
  submitButton: 'button:has-text("Entrar")',

  /** Caminho da listagem de empresas do perfil de contabilidade. */
  companiesPath: "/companies",

  /** Raiz da aplicação: só existe depois de autenticado. */
  appRoot: "toc-app",

  /** A grelha das empresas, três camadas de shadow DOM abaixo do `toc-app`. */
  companiesGrid: "vaadin-grid",

  /**
   * Hosts aceites depois do login. O TOConline sharda a conta por servidor
   * (`app5`, `app11`, …) e o número varia por gabinete — fixar um seria
   * garantir uma quebra silenciosa quando a conta migrasse.
   */
  hostPattern: /^app\d*\.toconline\.pt$/,
} as const;
