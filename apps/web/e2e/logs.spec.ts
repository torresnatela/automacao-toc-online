import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("tela inicial lista as integrações", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
  // Escopado ao conteúdo: "TOConline" também é um item do menu lateral, e um
  // getByText solto casaria os dois.
  const conteudo = page.getByRole("main");
  await expect(conteudo.getByText("TOConline")).toBeVisible();
  await expect(conteudo.getByText("e-Fatura")).toBeVisible();
});

test("login gera um evento user.login visível no drill-down de /logs", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();

  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();

  // O BD de e2e é partilhado e os ficheiros correm em paralelo: outras ações
  // (guardar credencial, enfileirar varredura) também abrem traces `manual`,
  // portanto "o mais recente" deixou de identificar o login. Procura-se o trace
  // certo entre os primeiros, em vez de assumir a posição.
  const manuais = page.getByRole("link", { name: "manual" });
  await expect(manuais.first()).toBeVisible();

  const candidatos = Math.min(await manuais.count(), 15);
  let encontrado = false;
  for (let i = 0; i < candidatos; i++) {
    await page.goto("/logs");
    await page.getByRole("link", { name: "manual" }).nth(i).click();
    // Esperar a navegação: count() não espera por ela e leria a lista anterior.
    await page.waitForURL(/\/logs\/[0-9a-f-]{36}/);
    // count() e não isVisible(): o drill-down pode mostrar o tipo mais de uma
    // vez, e isVisible() rebentaria em strict mode — que apanhado como "não
    // encontrado" esconderia o acerto.
    if ((await page.getByText("user.login").count()) > 0) {
      encontrado = true;
      break;
    }
  }
  expect(encontrado, "nenhum trace manual recente contém user.login").toBe(true);
});
