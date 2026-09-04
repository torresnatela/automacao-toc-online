import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// Do seed (supabase/seed.sql). É também a primeira equipa por nome, portanto a
// que a tela inicial escolhe para o admin — é isso que torna o caso do `/`
// determinístico.
const DEMO_TEAM = "22222222-2222-2222-2222-222222222222";

// NIF do Contabilista Certificado. `123456789` passa o dígito de controlo
// mod-11 de `isValidNif`; `123456780` tem o mesmo prefixo e falha-o — é o par
// que prova que a validação é o checksum e não a forma dos 9 dígitos.
const NIF_VALIDO = "123456789";
const NIF_INVALIDO = "123456780";

// Senhas fictícias da credencial da AT. Únicas por execução — o BD de e2e não é
// isolado — e usadas para provar que NUNCA voltam ao DOM.
const SENHA_AT = `senha-at-e2e-${Date.now()}`;
const SENHA_AT_NOVA = `senha-at-e2e-nova-${Date.now()}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SEM_SERVICE_ROLE = SUPABASE_URL === "" || SERVICE_ROLE === "";
const MOTIVO_SKIP =
  "precisa de NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (carregue o .env)";

// Os casos partilham a mesma equipa e a mesma credencial: em paralelo, um
// deixaria o formulário no estado que o outro não espera. Serial é honesto aqui.
//
// ATENÇÃO (entre ficheiros): `documentos-iva.spec.ts` cria e apaga a MESMA
// credencial (`at` da equipa demo) na sua montagem. A suíte tem de correr com
// `--workers=1` — que é como se corre — senão os dois ficheiros disputam a
// mesma linha. Não há mutex entre ficheiros no Playwright.
test.describe.configure({ mode: "serial" });

/**
 * Chamada à REST do Supabase com a service role.
 *
 * `fetch` global e não a fixture `request` do Playwright de propósito: `request`
 * é de âmbito *test* e não existe dentro de `beforeAll`/`afterAll`, que é onde a
 * limpeza tem de acontecer. Mesmo padrão de `documentos-iva.spec.ts`.
 */
async function rest(path: string, init: RequestInit = {}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  }
}

const CREDENCIAL_AT = `integration_credentials?team_id=eq.${DEMO_TEAM}&provider=eq.at&company_id=is.null`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Uma sessão para todos os casos do ficheiro.
 *
 * A fixture `page` obrigaria a um login por caso, e o GoTrue local corta aos 30
 * sign-ins por 5 minutos por IP (`sign_in_sign_ups`, em `supabase/config.toml`)
 * — a suíte inteira já anda perto desse tecto.
 */
const sessao = { page: null as unknown as Page };

test.beforeAll(async ({ browser }) => {
  // Sem service role não há como limpar a credencial no fim, e deixá-la ficar
  // mudaria o que os outros specs veem (a prontidão da listagem de IVA lê a
  // credencial da AT). Melhor não escrever nada de todo.
  test.skip(SEM_SERVICE_ROLE, MOTIVO_SKIP);

  sessao.page = await browser.newPage();
  await login(sessao.page, ADMIN_EMAIL, ADMIN_PASSWORD);
});

/**
 * Apaga a credencial `at` da equipa demo (a tabela base não é legível nem
 * escrevível por papel autenticado — só a service role lá chega).
 *
 * Sem isto, a credencial ficaria a mudar o que os outros specs veem: a
 * prontidão da listagem de `/documentos/iva` lê exatamente esta linha.
 */
test.afterAll(async () => {
  if (SEM_SERVICE_ROLE) return;
  try {
    await rest(CREDENCIAL_AT, { method: "DELETE" });
  } finally {
    await sessao.page?.close();
  }
});

/** Revela o campo da senha quando já há credencial guardada (nasce escondido). */
async function revelarSenha(page: Page) {
  const alterar = page.getByRole("button", { name: "Alterar" });
  if (await alterar.isVisible().catch(() => false)) await alterar.click();
}

test("admin guarda o acesso à AT e a senha nunca volta ao DOM", async () => {
  const page = sessao.page;
  await page.goto(`/integracoes/at?team=${DEMO_TEAM}`);
  await expect(page.getByText("Acesso à Autoridade Tributária")).toBeVisible();

  await revelarSenha(page);
  await page.getByLabel("NIF do Contabilista Certificado").fill(NIF_VALIDO);
  await page.getByLabel("Palavra-passe").fill(SENHA_AT);
  await page.getByRole("button", { name: /Guardar acesso à AT|Guardar alterações/ }).click();

  await expect(page.getByRole("status")).toContainText("Acesso à AT guardado.");
  await expect(page.getByText("Ligado")).toBeVisible();
});

test("recarregar não devolve a senha em campo nenhum", async () => {
  const page = sessao.page;
  await page.reload();

  await expect(page.getByText("Ligado")).toBeVisible();
  await expect(page.locator(`input[value="${SENHA_AT}"]`)).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(await page.content()).not.toContain(SENHA_AT);
});

test("NIF com dígito de controlo errado é recusado antes de tocar no portal", async () => {
  const page = sessao.page;
  await page.goto(`/integracoes/at?team=${DEMO_TEAM}`);

  // Sem senha nova: só o NIF muda, e é só ele que tem de falhar.
  await page.getByLabel("NIF do Contabilista Certificado").fill(NIF_INVALIDO);
  await page.getByRole("button", { name: /Guardar acesso à AT|Guardar alterações/ }).click();

  await expect(page.getByText("NIF do Contabilista Certificado inválido.")).toBeVisible();
});

test("a AT tem entrada na sidebar e a tela inicial liga-lhe com o estado real", async () => {
  const page = sessao.page;
  await page.goto("/");

  // `exact` porque a linha da tabela abaixo chama-se "Autoridade Tributária (AT)".
  await expect(
    page.getByRole("link", { name: "Autoridade Tributária", exact: true }),
  ).toBeVisible();

  const linhaAt = page.getByRole("row").filter({ hasText: "Autoridade Tributária (AT)" });
  await expect(linhaAt.getByRole("link", { name: "Autoridade Tributária (AT)" })).toHaveAttribute(
    "href",
    "/integracoes/at",
  );
  await expect(linhaAt).toContainText("Configurado");
});

test("credencial marcada pelo worker diz o motivo, e uma senha nova reativa-a", async () => {
  const page = sessao.page;

  // O que o worker escreve quando o portal recusa a senha. Feito pela REST
  // porque o worker não corre no e2e — o que se prova aqui é a leitura.
  await rest(CREDENCIAL_AT, {
    method: "PATCH",
    body: JSON.stringify({ status: "invalid", metadata: { invalidReason: "senha_bloqueada" } }),
  });

  await page.goto(`/integracoes/at?team=${DEMO_TEAM}`);
  const aviso = page.getByRole("alert").filter({ hasText: "Credencial marcada como" });
  await expect(aviso).toContainText(
    "Credencial marcada como inválida pelo worker (senha bloqueada por excesso de tentativas). " +
      "Guardar uma palavra-passe nova reativa-a.",
  );

  // E a saída que o aviso promete é a única que existe: guardar senha nova.
  await revelarSenha(page);
  await page.getByLabel("Palavra-passe").fill(SENHA_AT_NOVA);
  await page.getByRole("button", { name: /Guardar acesso à AT|Guardar alterações/ }).click();
  await expect(page.getByRole("status")).toContainText("Acesso à AT guardado.");

  await page.reload();
  await expect(aviso).toHaveCount(0);
  await expect(page.getByText("Ligado")).toBeVisible();
  expect(await page.content()).not.toContain(SENHA_AT_NOVA);
});
