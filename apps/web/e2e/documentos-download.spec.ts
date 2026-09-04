import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";
const OPERATOR_EMAIL = "operator@local.test";
const OPERATOR_PASSWORD = "operator123";

// Do seed (supabase/seed.sql).
const DEMO_TEAM = "22222222-2222-2222-2222-222222222222";
const DOC_DEMO = "77777777-7777-7777-7777-777777777777";
// A empresa dona do DOC_DEMO — é a linha da listagem que tem de oferecer o PDF.
const LIGADA = "Empresa Ligada Demo";
const DOC_OUTRO = "88888888-8888-8888-8888-888888888888";
// Guia com a linha criada e o ficheiro ainda por subir (`storage_path` nulo).
const DOC_SEM_FICHEIRO = "0c0c0c0c-0c0c-0c0c-0c0c-0c0c0c0c0c0c";
const SEM_FICHEIRO = "Empresa Sem Ficheiro Demo";
const PATH_DEMO = `${DEMO_TEAM}/33333333-3333-3333-3333-333333333333/iva/2026-07.pdf`;
const PATH_OUTRO =
  "55555555-5555-5555-5555-555555555555/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/iva/2026-07.pdf";

// Prefixo do caminho no storage: se aparecer no HTML, a listagem está a vazar
// para o browser a chave que permitiria pedir a guia de outra equipa.
const PREFIXO_CAMINHO = `${DEMO_TEAM}/33333333-`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SEM_STORAGE = SUPABASE_URL === "" || SERVICE_ROLE === "";
const MOTIVO_SKIP =
  "precisa de NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (carregue o .env)";

/**
 * PDF mínimo mas verdadeiro: o bucket só aceita `application/pdf` e o
 * storage-api confere a assinatura `%PDF`. O enchimento existe só para o
 * ficheiro ter tamanho plausível — nada aqui é lido como PDF.
 */
const PDF_MINIMO = `%PDF-1.4\n${"% padding ".repeat(120)}\n%%EOF\n`;

/**
 * Carrega os objetos no bucket privado com a service role.
 *
 * Precisam de existir: `createSignedUrl` falha para um caminho sem objeto, e o
 * seed povoa a linha `documents`, não o storage. Também o do outro gabinete,
 * senão o caso do admin global provaria o 404 do storage em vez do acesso
 * concedido. Vive no `beforeAll` porque a fixture `request` do Playwright é de
 * âmbito *test* e não existe aqui — daí o contexto avulso a partir da fixture
 * `playwright`, essa de âmbito *worker*.
 *
 * Não há `afterAll` a apagá-los, e é de propósito: o caminho é determinístico e
 * o `x-upsert` torna a recorrida idempotente, portanto nada se acumula. E como
 * `has_file` vem da linha `documents` e não do objeto, deixar os ficheiros no
 * bucket não muda o que qualquer outro spec vê na listagem.
 */
test.beforeAll(async ({ playwright }) => {
  if (SEM_STORAGE) return;
  const api = await playwright.request.newContext();
  try {
    for (const caminho of [PATH_DEMO, PATH_OUTRO]) {
      const res = await api.post(`${SUPABASE_URL}/storage/v1/object/documents/${caminho}`, {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/pdf",
          "x-upsert": "true",
        },
        data: PDF_MINIMO,
      });
      if (!res.ok()) {
        throw new Error(`upload de ${caminho} → ${res.status()} ${await res.text()}`);
      }
    }
  } finally {
    await api.dispose();
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** O 302 cru: sem `maxRedirects: 0` o Playwright seguiria já para o storage. */
function baixar(page: Page, documentId: string, query = "") {
  return page.request.get(`/api/documents/${documentId}/download${query}`, { maxRedirects: 0 });
}

/** A linha da tabela de uma empresa, pelo nome (como em `documentos-iva.spec.ts`). */
function linha(page: Page, empresa: string) {
  return page.getByRole("row").filter({ hasText: empresa });
}

/**
 * Uma sessão por papel, partilhada pelos casos do bloco.
 *
 * A fixture `page` obrigaria a um login por caso, e o GoTrue local corta aos 30
 * sign-ins por 5 minutos por IP (`sign_in_sign_ups`, em `supabase/config.toml`)
 * — a suite inteira já anda perto desse tecto. Como os casos passam a partilhar
 * a página, o bloco tem de correr em `serial`.
 */
function sessaoPartilhada(email: string, password: string): { page: Page } {
  test.describe.configure({ mode: "serial" });
  const sessao = { page: null as unknown as Page };

  test.beforeAll(async ({ browser }) => {
    sessao.page = await browser.newPage();
    await login(sessao.page, email, password);
  });

  test.afterAll(async () => {
    await sessao.page?.close();
  });

  return sessao;
}

test("sem sessão o download responde 401 JSON", async ({ request }) => {
  const res = await request.get(`/api/documents/${DOC_DEMO}/download`);
  expect(res.status()).toBe(401);
  expect((await res.json()).ok).toBe(false);
});

test.describe("como operador da equipa demo", () => {
  const sessao = sessaoPartilhada(OPERATOR_EMAIL, OPERATOR_PASSWORD);

  test("recebe 302 para uma signed URL de curta duração", async () => {
    test.skip(SEM_STORAGE, MOTIVO_SKIP);

    const res = await baixar(sessao.page, DOC_DEMO);
    expect(res.status()).toBe(302);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/storage/v1/object/sign/documents/");
    expect(location).toContain("token=");
    // O token vai no `Location`: nenhuma cache o pode guardar e o storage não
    // fica a saber de que página do dashboard veio o pedido.
    expect(res.headers()["cache-control"] ?? "").toContain("no-store");
    expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("não vê a guia de outra equipa: 404, não 403", async () => {
    const res = await baixar(sessao.page, DOC_OUTRO);
    expect(res.status()).toBe(404);
    expect((await res.json()).ok).toBe(false);
  });

  test("id inexistente e id malformado dão 404 (nunca 500)", async () => {
    const inexistente = await baixar(sessao.page, "00000000-0000-0000-0000-000000000000");
    expect(inexistente.status()).toBe(404);

    const malformado = await baixar(sessao.page, "nao-e-um-uuid");
    expect(malformado.status()).toBe(404);
    expect((await malformado.json()).ok).toBe(false);
  });

  test("a guia sem ficheiro distingue-se da que não existe", async () => {
    // 404 nos dois casos (é o que resiste à enumeração de ids), mas com
    // mensagens diferentes: quem está à espera da guia tem de saber que a
    // empresa é a certa e que o que falta é o RPA subir o PDF.
    const res = await baixar(sessao.page, DOC_SEM_FICHEIRO);
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Ficheiro ainda não disponível." });
  });

  test("?download=1 pede um anexo com nome sem dados pessoais", async () => {
    test.skip(SEM_STORAGE, MOTIVO_SKIP);

    const res = await baixar(sessao.page, DOC_DEMO, "?download=1");
    expect(res.status()).toBe(302);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("download=");
    // Nome derivado do uuid do documento: sem NIF nem nome de empresa.
    expect(location).toContain(`guia-iva-${DOC_DEMO.slice(0, 8)}`);
  });
});

test.describe("como admin global", () => {
  const sessao = sessaoPartilhada(ADMIN_EMAIL, ADMIN_PASSWORD);

  test("descarrega a guia de qualquer equipa", async () => {
    test.skip(SEM_STORAGE, MOTIVO_SKIP);

    const res = await baixar(sessao.page, DOC_OUTRO);
    expect(res.status()).toBe(302);
    expect(res.headers()["location"] ?? "").toContain("/storage/v1/object/sign/documents/");
  });

  test("a listagem liga ao PDF sem pôr a signed URL nem o caminho no DOM", async () => {
    const page = sessao.page;
    await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);
    await expect(page.getByRole("heading", { name: "Guias de IVA" })).toBeVisible();

    // Escopado à linha da empresa dona do DOC_DEMO: um `.first()` solto casaria
    // o link de qualquer empresa e deixaria de provar que É esta guia que a
    // linha desta empresa oferece.
    const pdf = linha(page, LIGADA).getByRole("link", { name: "PDF" });
    await expect(pdf).toHaveAttribute("href", `/api/documents/${DOC_DEMO}/download`);

    // A linha da empresa cujo documento ainda não tem ficheiro não oferece
    // link nenhum: o `has_file` da view é que manda, não a existência da linha
    // `documents` — oferecer um link que dá 404 seria pior do que não o ter.
    await expect(linha(page, SEM_FICHEIRO).getByRole("link", { name: "PDF" })).toHaveCount(0);

    const html = await page.content();
    expect(html).not.toContain("/storage/v1/");
    expect(html).not.toContain("token=");
    expect(html).not.toContain(PREFIXO_CAMINHO);
  });
});
