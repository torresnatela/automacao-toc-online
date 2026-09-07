/**
 * Reconhecimento do Portal das Finanças (Fase 0) — ferramenta manual, headed.
 *
 * Tudo o que está marcado `TODO(recon)` em `src/at/selectors.ts` e
 * `src/at/wording.ts` é palpite informado. Este script existe para o deixar de
 * ser: abre um browser visível, pára entre etapas (`page.pause()`) para **um
 * humano** conduzir o percurso, e regista o que a AT respondeu.
 *
 * Não automatiza nada e não decide nada. O que produz são provas — screenshots,
 * assinaturas de página, nomes de campos, cabeçalhos de rede — para se escrever
 * a tabela de seletores e o go/no-go A vs B em
 * `docs/superpowers/specs/<data>-at-recon.md`.
 *
 * Cada etapa é fotografada **duas vezes**: `antes` (a página como o portal a
 * entregou, antes de alguém lhe tocar) e `depois` (o que a ação produziu). É o
 * `antes` que carrega os seletores a copiar — o formulário de login, a caixa do
 * NIF, os campos de ano/período — e que se perderia se só se fotografasse
 * depois de o humano já ter navegado para fora dele.
 *
 * Uso (nada carrega o `.env` por si — o preâmbulo é obrigatório):
 *   set -a && . ./.env && set +a && \
 *     pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route b --nif 123456789
 *   set -a && . ./.env && set +a && \
 *     pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route a --company 4321:5
 *
 * Credenciais **só por ambiente** (rota B: `AT_RECON_USER`/`AT_RECON_PASSWORD`;
 * rota A: `TOCONLINE_USER`/`TOCONLINE_PASSWORD`). Nunca por argv (fica no
 * histórico da shell e na lista de processos), nunca da base de dados, nunca
 * gravadas em disco por este script.
 */
import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Download, type Page, type Response } from "playwright";
import { fingerprint, snapshotPage } from "../src/at/classify-page";
import { installKeepNamesShim } from "../src/browser/keep-names-shim";
import { PersistentChromiumBrowser } from "../src/browser/persistent-chromium";
import { AT, TOC_DIRECT_ACCESS } from "../src/at/selectors";
import { TOCONLINE } from "../src/toconline/selectors";

/** Vagar deliberado: dá para ver o que o portal faz, e não parece um robô. */
const SLOW_MO_MS = 250;
/**
 * Perfil do Chromium quando a rota A precisa da extensão do TOConline carregada
 * — um perfil SÓ do reconhecimento, separado do do worker, para uma sessão
 * observada à mão nunca ficar a valer num lote. Resolvido a partir deste
 * ficheiro (como a pasta dos artefactos): correr o script de outra pasta não
 * pode espalhar perfis de sessão pelo disco.
 */
const PERFIL_CHROME_POR_OMISSAO = fileURLToPath(new URL("../.rpa/chromium-recon", import.meta.url));
/** Onde `scripts/install-toconline-connect.ts` deixa a extensão por omissão. */
const EXTENSAO_POR_OMISSAO = fileURLToPath(
  new URL("../.rpa/extensions/toconline-connect", import.meta.url),
);

type Rota = "a" | "b";

interface Argumentos {
  rota: Rota;
  nif?: string;
  tocCompanyId?: number;
  tocCluster?: number;
}

const PREAMBULO = "set -a && . ./.env && set +a &&";

const USO = `
Uso (a partir da raiz do repo — nada carrega o .env por si):
  ${PREAMBULO} pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route b --nif <nif>
  ${PREAMBULO} pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route a --company <id>:<cluster>

Credenciais (só por ambiente, nunca por argumento):
  rota b → AT_RECON_USER, AT_RECON_PASSWORD
  rota a → TOCONLINE_USER, TOCONLINE_PASSWORD

Opcional (rota a): RPA_CHROME_USER_DATA_DIR (perfil; omissão .rpa/chromium-recon),
                   RPA_CHROME_EXTENSION_DIR (omissão .rpa/extensions/toconline-connect —
                   instale com scripts/install-toconline-connect.ts)
`.trim();

/** Sai com uma mensagem. Nunca imprime valores de variáveis — só os NOMES. */
function abortar(mensagem: string): never {
  console.error(`[recon] ${mensagem}`);
  process.exit(1);
}

function lerArgumentos(argv: string[]): Argumentos {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith("--")) continue;
    const proximo = argv[i + 1];
    flags.set(arg.slice(2), proximo !== undefined && !proximo.startsWith("--") ? proximo : "");
  }

  if (flags.has("help")) {
    console.log(USO);
    process.exit(0);
  }

  const rotaBruta = (flags.get("route") ?? "").toLowerCase();
  if (rotaBruta !== "a" && rotaBruta !== "b") abortar(`--route tem de ser "a" ou "b".\n\n${USO}`);
  const rota: Rota = rotaBruta;

  if (rota === "b") {
    const nif = flags.get("nif") ?? "";
    if (!/^\d{9}$/.test(nif)) abortar(`--nif tem de ser um NIF de 9 dígitos.\n\n${USO}`);
    return { rota, nif };
  }

  const [id, cluster] = (flags.get("company") ?? "").split(":");
  if (!id || !cluster || !/^\d+$/.test(id) || !/^\d+$/.test(cluster)) {
    abortar(`--company tem de ser <tocCompanyId>:<cluster>, ambos numéricos.\n\n${USO}`);
  }
  return { rota, tocCompanyId: Number(id), tocCluster: Number(cluster) };
}

/** Lê as credenciais do ambiente. Em falta → sai a dizer que NOMES faltam. */
function lerCredenciais(rota: Rota): { username: string; password: string } {
  const nomes =
    rota === "b"
      ? (["AT_RECON_USER", "AT_RECON_PASSWORD"] as const)
      : (["TOCONLINE_USER", "TOCONLINE_PASSWORD"] as const);
  const emFalta = nomes.filter((nome) => !process.env[nome]);
  if (emFalta.length > 0) {
    abortar(
      `Variáveis de ambiente em falta para a rota ${rota.toUpperCase()}: ${emFalta.join(", ")}.\n` +
        "Defina-as no .env (que não é versionado) e corra com o .env CARREGADO —\n" +
        "nem o pnpm nem o tsx o leem sozinhos:\n" +
        `  ${PREAMBULO} pnpm --filter @toc/worker exec tsx scripts/recon-at.ts …`,
    );
  }
  return {
    username: process.env[nomes[0]] as string,
    password: process.env[nomes[1]] as string,
  };
}

/** `apps/worker/recon/<yyyy-mm-dd-HHmm>/`, resolvido a partir deste ficheiro. */
function pastaDeSaida(): string {
  const agora = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const carimbo =
    `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}` +
    `-${p(agora.getHours())}${p(agora.getMinutes())}`;
  return join(fileURLToPath(new URL("../recon", import.meta.url)), carimbo);
}

/** URL sem query string: na AT a query leva NIFs. */
function semQuery(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "(url inválida)";
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(url inválida)";
  }
}

/**
 * O registador da sessão: escreve os artefactos e conta o que produziu, para o
 * resumo final dizer ao operador o que tem em mãos.
 */
type Momento = "antes" | "depois";

class Registo {
  private etapa = 0;
  readonly etapas: string[] = [];
  readonly ficheiros: string[] = [];

  constructor(private readonly dir: string) {}

  private async escrever(nome: string, conteudo: string): Promise<void> {
    await writeFile(join(this.dir, nome), conteudo);
    this.ficheiros.push(nome);
  }

  /** Uma linha JSON num ficheiro contínuo da sessão. */
  async linha(ficheiro: string, dados: Record<string, unknown>): Promise<void> {
    try {
      await appendFile(join(this.dir, ficheiro), `${JSON.stringify(dados)}\n`);
      if (!this.ficheiros.includes(ficheiro)) this.ficheiros.push(ficheiro);
    } catch {
      // Um registo perdido não pode derrubar o reconhecimento a meio.
    }
  }

  /**
   * Fotografa um momento de uma etapa: screenshot de página inteira, assinatura
   * redigida e a forma dos formulários. **Nunca valores de campos** — a senha
   * está lá.
   *
   * `antes` numera a etapa; `depois` reaproveita o mesmo número, para os dois
   * lados do mesmo passo ficarem lado a lado quando se ordena a pasta.
   */
  async capturar(page: Page, nome: string, momento: Momento): Promise<void> {
    if (momento === "antes") this.etapa += 1;
    const prefixo = `${String(this.etapa).padStart(2, "0")}-${nome}.${momento}`;
    this.etapas.push(prefixo);

    try {
      await page.screenshot({ path: join(this.dir, `${prefixo}.png`), fullPage: true });
      this.ficheiros.push(`${prefixo}.png`);
    } catch (err) {
      console.error(`[recon] screenshot de ${prefixo} falhou: ${mensagemDe(err)}`);
    }

    try {
      const snapshot = await snapshotPage(page);
      await this.escrever(
        `${prefixo}.fingerprint.json`,
        `${JSON.stringify(fingerprint(snapshot), null, 2)}\n`,
      );
    } catch (err) {
      await this.escrever(
        `${prefixo}.fingerprint.json`,
        `${JSON.stringify({ erro: mensagemDe(err) }, null, 2)}\n`,
      );
    }

    try {
      const forms = await lerFormularios(page);
      await this.escrever(`${prefixo}.forms.json`, `${JSON.stringify(forms, null, 2)}\n`);
    } catch (err) {
      await this.escrever(
        `${prefixo}.forms.json`,
        `${JSON.stringify({ erro: mensagemDe(err) }, null, 2)}\n`,
      );
    }

    // Um popup aberto nesta etapa é metade do achado (é assim que a AT entrega
    // a guia): fotografa-se também, com o mesmo número de etapa.
    const paginas = page.context().pages();
    const extras = paginas.filter((p) => p !== page && !p.isClosed());
    for (const [i, extra] of extras.entries()) {
      const sufixo = `${prefixo}.popup${i + 1}`;
      try {
        await extra.screenshot({ path: join(this.dir, `${sufixo}.png`), fullPage: true });
        this.ficheiros.push(`${sufixo}.png`);
        const snapshot = await snapshotPage(extra);
        await this.escrever(
          `${sufixo}.fingerprint.json`,
          `${JSON.stringify(fingerprint(snapshot), null, 2)}\n`,
        );
      } catch (err) {
        console.error(`[recon] popup ${sufixo} não pôde ser fotografado: ${mensagemDe(err)}`);
      }
    }
  }
}

function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Nomes, tipos e ids dos campos, por formulário. O `value` **nunca** entra:
 * este ficheiro é para se saber que seletores escrever, não o que foi escrito.
 */
async function lerFormularios(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    type El = {
      getAttribute: (name: string) => string | null;
      tagName: string;
      querySelectorAll: (selector: string) => ArrayLike<El>;
    };
    type Scope = { querySelectorAll: (selector: string) => ArrayLike<El> };
    const doc = (globalThis as unknown as { document: Scope }).document;

    const campos = (scope: Scope) =>
      Array.from(scope.querySelectorAll("input, select, textarea, button")).map((el) => ({
        tag: el.tagName.toLowerCase(),
        name: el.getAttribute("name"),
        id: el.getAttribute("id"),
        type: el.getAttribute("type"),
      }));

    const forms = Array.from(doc.querySelectorAll("form")).map((form, index) => ({
      index,
      action: form.getAttribute("action"),
      method: form.getAttribute("method"),
      fields: campos(form),
    }));

    // Campos fora de qualquer `<form>` continuam a ser campos.
    return { forms, soltos: forms.length === 0 ? campos(doc) : [] };
  });
}

/** Liga as escutas da sessão: rede, popups e downloads. */
function escutar(context: BrowserContext, registo: Registo): void {
  context.on("response", (response: Response) => {
    const headers = response.headers();
    void registo.linha("network.jsonl", {
      ts: new Date().toISOString(),
      method: response.request().method(),
      url: semQuery(response.url()),
      status: response.status(),
      contentType: headers["content-type"] ?? null,
      contentDisposition: headers["content-disposition"] ?? null,
    });
  });

  // Também às páginas JÁ abertas: um contexto persistente (rota A) nasce com
  // uma, que nunca dispara o evento `page` — e é nela que o download acontece.
  for (const page of context.pages()) escutarPagina(page, registo);
  context.on("page", (page: Page) => escutarPagina(page, registo));
}

/** Popups, fecho e downloads de UMA página. */
function escutarPagina(page: Page, registo: Registo): void {
  void registo.linha("pages.jsonl", {
    ts: new Date().toISOString(),
    event: "open",
    host: hostDe(page.url()),
  });
  page.on("close", () => {
    void registo.linha("pages.jsonl", {
      ts: new Date().toISOString(),
      event: "close",
      host: hostDe(page.url()),
    });
  });
  // A sequência de hosts por que o separador passa (só o host, nunca a query,
  // que na AT leva NIFs): na rota A é o que mostra se o login da extensão vai
  // pelo acesso.gov.pt, se pára num desafio, e onde aterra.
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    void registo.linha("pages.jsonl", {
      ts: new Date().toISOString(),
      event: "navigate",
      host: hostDe(frame.url()),
      path: (() => {
        try {
          return new URL(frame.url()).pathname;
        } catch {
          return null;
        }
      })(),
    });
  });
  // O ficheiro em si NÃO é guardado: é a guia real de um contribuinte. Só o
  // nome sugerido e o tamanho, que é o que diz como a AT entrega o PDF.
  page.on("download", (download: Download) => {
    void (async () => {
      let bytes: number | null = null;
      try {
        const caminho = await download.path();
        if (caminho) bytes = (await stat(caminho)).size;
      } catch {
        bytes = null;
      }
      await registo.linha("downloads.jsonl", {
        ts: new Date().toISOString(),
        suggestedFilename: download.suggestedFilename(),
        bytes,
        url: semQuery(download.url()),
      });
    })();
  });
}

/**
 * Abre o browser conforme a rota.
 *
 * Rota A: o mesmo `PersistentChromiumBrowser` do worker (Chromium do Playwright
 * com a extensão TOConline Connect descompactada — desde o Chrome 137 as builds
 * de marca ignoram `--load-extension`), headed e com vagar. Rota B: um Chromium
 * normal, que só precisa de um browser.
 */
async function abrirContexto(
  rota: Rota,
): Promise<{ context: BrowserContext; fechar: () => Promise<void> }> {
  if (rota === "a") {
    const persistent = new PersistentChromiumBrowser({
      userDataDir: process.env.RPA_CHROME_USER_DATA_DIR || PERFIL_CHROME_POR_OMISSAO,
      extensionDir: process.env.RPA_CHROME_EXTENSION_DIR || EXTENSAO_POR_OMISSAO,
      headless: false,
      slowMoMs: SLOW_MO_MS,
    });
    const context = await persistent.context();
    const extensao = await persistent.extension();
    if (extensao === null) {
      console.error(
        "[recon] AVISO: a extensão TOConline Connect NÃO carregou — o TOConline vai pedir para a instalar.\n" +
          "[recon]        Corra scripts/install-toconline-connect.ts e confirme RPA_CHROME_EXTENSION_DIR.",
      );
    } else {
      console.log(`[recon] extensão carregada: ${extensao.id} v${extensao.version}`);
    }
    return { context, fechar: () => persistent.close() };
  }

  const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO_MS });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
    locale: "pt-PT",
  });
  await installKeepNamesShim(context);
  return { context, fechar: () => browser.close() };
}

/** A pausa é o ponto do exercício: quem conduz é a pessoa, não o script. */
async function pausa(page: Page, instrucao: string): Promise<void> {
  console.log(`\n[recon] ▶ ${instrucao}`);
  console.log("[recon]   Continue no Inspector do Playwright (botão ▶ Resume).\n");
  await page.pause();
}

/**
 * Uma etapa completa: fotografa a página **antes** de alguém lhe tocar, deixa
 * a pessoa conduzir, e fotografa o que ficou.
 *
 * O `antes` é o que interessa para os seletores. Fotografar só no fim daria,
 * para a etapa `login`, uma imagem da página de destino — e o formulário de
 * login, que é justamente o que os `TODO(recon)` de `selectors.ts` esperam,
 * já não estaria lá para se ler.
 *
 * `agir` corre depois do `antes` e antes da pausa: é onde entram as ações do
 * script (preencher campos, chamar a função de troca de empresa) que não podem
 * contaminar a fotografia da página tal como o portal a entregou.
 */
async function etapa(
  registo: Registo,
  page: Page,
  nome: string,
  instrucao: string,
  agir?: () => Promise<void>,
): Promise<void> {
  await registo.capturar(page, nome, "antes");
  if (agir) await agir();
  await pausa(page, instrucao);
  await registo.capturar(page, nome, "depois");
}

async function rotaB(context: BrowserContext, registo: Registo, args: Argumentos): Promise<void> {
  const { username, password } = lerCredenciais("b");
  const page = await context.newPage();

  await irPara(page, AT.loginUrl);
  await etapa(
    registo,
    page,
    "login",
    "LOGIN: submeta e observe a redação de erro, 2FA e troca de senha. Retome no portal.",
    async () => {
      // Preenchido por conveniência, e SÓ depois da fotografia: se os seletores
      // estiverem errados (é o que se vem cá descobrir), preencha à mão — o
      // script não desiste por isso, e o `antes` continua a mostrar o campo.
      await preencherSeExistir(page, AT.login.usernameInput, username);
      await preencherSeExistir(page, AT.login.passwordInput, password);
    },
  );

  await irPara(page, `${AT.portalOrigin}${AT.paths.cc.listaClientes}`);
  await etapa(
    registo,
    page,
    "client_select",
    `SELEÇÃO DE CLIENTE: escolha o NIF ${args.nif ?? ""} e retome.`,
  );

  await irPara(page, `${AT.portalOrigin}${AT.paths.cc.consultarDeclaracao}`);
  await etapa(
    registo,
    page,
    "consultar_declaracao",
    "CONSULTAR DECLARAÇÃO: observe colunas, formato do período, substituições e 'sem declarações'.",
  );

  await irPara(page, `${AT.portalOrigin}${AT.paths.cc.obterDocumentoPagamento}`);
  await etapa(
    registo,
    page,
    "obter_doc_pagamento",
    "OBTER DOC. PAGAMENTO: peça a guia e repare COMO ela chega (download / inline / popup).",
  );
}

async function rotaA(context: BrowserContext, registo: Registo, args: Argumentos): Promise<void> {
  const { username, password } = lerCredenciais("a");
  const page = context.pages()[0] ?? (await context.newPage());

  await irPara(page, TOCONLINE.loginUrl);
  await etapa(
    registo,
    page,
    "toconline_login",
    "LOGIN TOCONLINE: submeta e retome já dentro da aplicação.",
    async () => {
      await preencherSeExistir(page, TOCONLINE.usernameInput, username);
      await preencherSeExistir(page, TOCONLINE.passwordInput, password);
    },
  );

  await etapa(
    registo,
    page,
    "switch_entity",
    "SWITCH DE EMPRESA: confirme que a empresa ativa mudou e retome.",
    async () => {
      // A troca de empresa ativa é uma função global da aplicação. Se ela mudou
      // de nome (ou deixou de existir), é exatamente isso que se veio descobrir
      // — daí o erro ser registado em vez de matar a sessão.
      const chamada = `${TOC_DIRECT_ACCESS.appElement}.${TOC_DIRECT_ACCESS.switchEntityFn}(${args.tocCompanyId}, "${TOC_DIRECT_ACCESS.vaultActionsPath}")`;
      try {
        await page
          .evaluate(
            ([appElement, fn, id, url]) =>
              ((globalThis as unknown as { document: { querySelector: (s: string) => unknown } }).document.querySelector(appElement) as Record<string, (i: number, u: string) => unknown>)[fn]!(id, url),
            [TOC_DIRECT_ACCESS.appElement, TOC_DIRECT_ACCESS.switchEntityFn, args.tocCompanyId ?? 0, TOC_DIRECT_ACCESS.vaultActionsPath] as const,
          )
          .catch(() => undefined);
        console.log(`[recon] switch de empresa executado: ${chamada}`);
      } catch (err) {
        console.error(`[recon] switch de empresa FALHOU (${chamada}): ${mensagemDe(err)}`);
        await registo.linha("pages.jsonl", {
          ts: new Date().toISOString(),
          event: "switch_entity_error",
          call: chamada,
          error: mensagemDe(err),
        });
      }
    },
  );

  // Navegação pela própria app: um `goto` depois do login derruba a sessão.
  await page
    .evaluate(
      ([appElement, changeRoute, url]) =>
        ((globalThis as unknown as { document: { querySelector: (s: string) => unknown } }).document.querySelector(appElement) as Record<string, (u: string) => void>)[changeRoute]!(url),
      [TOC_DIRECT_ACCESS.appElement, TOC_DIRECT_ACCESS.changeRouteFn, TOC_DIRECT_ACCESS.vaultActionsPath] as const,
    )
    .catch((err) => console.error(`[recon] changeRoute falhou: ${mensagemDe(err)}`));
  await etapa(
    registo,
    page,
    "summary",
    "SUMÁRIO: (a) o TOConline reconhece a extensão ou pede para a instalar? (b) localize o menu " +
      "'Acesso Direto' e anote a estrutura (é Shadow DOM: seletores CSS, nunca XPath); (c) confira " +
      "a redação quando a senha da AT da empresa NÃO está gravada (teste com uma empresa sem senha). Retome.",
  );

  await etapa(
    registo,
    page,
    "direct_access",
    "ACESSO DIRETO: clique em 'Portal das Finanças'. Observe: (d) aparece algum diálogo antes " +
      "(escolha de senha/utilizador)? (e) abre um separador novo? por que hosts passa (pages.jsonl)? " +
      "(f) a AT pede código por SMS/2FA? (g) a extensão fecha o separador? Retome com a AT aberta.",
  );

  await etapa(
    registo,
    page,
    "at_landing",
    "ATERRAGEM NA AT: confirme o host, que a sessão é da empresa certa (NIF no ecrã), e experimente " +
      `os caminhos diretos ${AT.paths.direct.consultarDeclaracao} e ${AT.paths.direct.obterDocumentoPagamento}.`,
  );

  await etapa(
    registo,
    page,
    "consultar_declaracao",
    "CONSULTAR DECLARAÇÃO: mesma observação da rota B.",
  );

  await etapa(
    registo,
    page,
    "obter_doc_pagamento",
    "OBTER DOC. PAGAMENTO: repare COMO a guia chega.",
  );
}

/** Navega sem desistir: a página errada também é um achado a fotografar. */
async function irPara(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: AT.defaultTimeoutMs });
  } catch (err) {
    console.error(`[recon] navegação para ${semQuery(url)} falhou: ${mensagemDe(err)}`);
  }
}

/**
 * Preenche se o seletor existir. Todos os seletores de login são `TODO(recon)`:
 * um que não bata certo é informação, não motivo para abortar.
 */
async function preencherSeExistir(page: Page, seletor: string, valor: string): Promise<void> {
  try {
    await page.fill(seletor, valor, { timeout: 5_000 });
  } catch {
    console.error(`[recon] seletor não encontrado (preencha à mão): ${seletor}`);
  }
}

async function main(): Promise<void> {
  const args = lerArgumentos(process.argv.slice(2));
  // As credenciais são lidas ANTES de abrir o browser: faltar uma variável não
  // pode ser descoberto com uma janela já aberta e o operador à espera.
  lerCredenciais(args.rota);

  const dir = pastaDeSaida();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const registo = new Registo(dir);

  console.log(`[recon] rota ${args.rota.toUpperCase()} — artefactos em ${dir}`);

  const { context, fechar } = await abrirContexto(args.rota);
  escutar(context, registo);

  try {
    if (args.rota === "b") await rotaB(context, registo, args);
    else await rotaA(context, registo, args);
  } finally {
    await fechar().catch(() => undefined);
    console.log("\n[recon] ─── resumo ───");
    console.log(`[recon] etapas: ${registo.etapas.join(", ") || "(nenhuma)"}`);
    console.log(`[recon] ficheiros (${registo.ficheiros.length}) em ${dir}:`);
    for (const f of registo.ficheiros) console.log(`[recon]   - ${f}`);
    console.log(
      "\n[recon] AVISO: os screenshots contêm dados reais de contribuintes.\n" +
        "[recon] Partilhe-os só pelo canal seguro do gabinete. Nada desta pasta\n" +
        "[recon] vai para o git — commite apenas as TABELAS resumidas em\n" +
        "[recon] docs/superpowers/specs/<data>-at-recon.md.\n",
    );
  }
}

main().catch((err) => {
  console.error(`[recon] falha fatal: ${mensagemDe(err)}`);
  process.exit(1);
});
