import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// Nome único por execução — o BD de e2e não é isolado (dados acumulam).
const teamName = `Gabinete E2E ${Date.now()}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("admin cadastra uma equipe e ela aparece na lista", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/); // login concluído (leva a "/")

  await page.goto("/equipes");
  await expect(page.getByRole("heading", { name: "Equipes" })).toBeVisible();

  await page.getByLabel("Nome do gabinete").fill(teamName);
  await page.getByRole("button", { name: "Cadastrar" }).click();

  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("cell", { name: teamName })).toBeVisible();
});
