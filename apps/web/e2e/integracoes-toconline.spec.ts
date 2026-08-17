import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// Senha fictícia da credencial TOConline. Única por execução — o BD de e2e não
// é isolado — e usada para provar que NUNCA volta ao DOM.
const TOC_USER = `gabinete-${Date.now()}@example.pt`;
const TOC_PASSWORD = `senha-secreta-${Date.now()}`;

// Os dois testes partilham a mesma equipe e a mesma credencial: em paralelo, um
// deixaria o formulário no estado que o outro não espera. Serial é honesto aqui.
test.describe.configure({ mode: "serial" });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Grava a credencial, quer a ligação já exista ou não. */
async function saveCredential(page: Page) {
  // Com credencial guardada o campo nasce escondido — revelá-lo é deliberado.
  const alterar = page.getByRole("button", { name: "Alterar" });
  if (await alterar.isVisible().catch(() => false)) await alterar.click();

  await page.getByLabel("Utilizador TOConline").fill(TOC_USER);
  await page.getByLabel("Palavra-passe").fill(TOC_PASSWORD);
  await page.getByRole("button", { name: /Ligar ao TOConline|Guardar alterações/ }).click();
  await expect(page.getByRole("status")).toBeVisible();
}

test("admin liga o gabinete ao TOConline e a senha nunca volta ao DOM", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/integracoes/toconline");
  await expect(page.getByRole("heading", { name: "TOConline" })).toBeVisible();

  await saveCredential(page);

  // A garantia central: recarregar não devolve a senha, em campo nenhum.
  await page.reload();
  await expect(page.getByText("Ligado")).toBeVisible();
  await expect(page.locator(`input[value="${TOC_PASSWORD}"]`)).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(await page.content()).not.toContain(TOC_PASSWORD);
});

test("a varredura enfileira um job e um segundo clique não cria outro", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/integracoes/toconline");

  if (!(await page.getByText("Ligado").isVisible().catch(() => false))) {
    await saveCredential(page);
  }

  await page.getByRole("button", { name: "Varredura de empresas" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  // O worker não corre no e2e, portanto o job fica em "Na fila" — o que torna
  // a asserção determinística.
  await expect(page.getByText("Na fila")).toBeVisible();

  // Segundo clique: reaproveita o job em curso em vez de lançar outra sessão
  // de browser contra o TOConline.
  await page.getByRole("button", { name: "Varredura de empresas" }).click();
  await expect(page.getByText(/Já existe uma varredura em curso/)).toBeVisible();
});
