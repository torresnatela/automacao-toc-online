import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// NISS de 11 dígitos, único por execução (BD de e2e acumula dados).
const niss = `2${String(Date.now()).slice(-10)}`;
const companyName = `Empresa E2E ${Date.now()}`;
const renamed = `${companyName} (editada)`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("admin cadastra uma empresa, ela aparece na lista e pode ser editada", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).not.toHaveURL(/\/login/); // login concluído (leva a "/")

  await page.goto("/empresas");
  await expect(page.getByRole("heading", { name: "Empresas" })).toBeVisible();

  // Admin escolhe a equipe (seed cria "Gabinete Demo").
  await page.getByLabel("Equipe").selectOption({ label: "Gabinete Demo" });
  await page.getByLabel("NISS").fill(niss);
  await page.getByLabel("Nome").fill(companyName);
  await page.getByRole("button", { name: "Cadastrar" }).click();

  await expect(page.getByRole("cell", { name: companyName })).toBeVisible();

  // Edita: abre a linha, renomeia e salva.
  await page
    .getByRole("row", { name: new RegExp(companyName) })
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(page).toHaveURL(/\/empresas\/[0-9a-f-]+$/);
  await page.getByLabel("Nome").fill(renamed);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto("/empresas");
  await expect(page.getByRole("cell", { name: renamed })).toBeVisible();
});
