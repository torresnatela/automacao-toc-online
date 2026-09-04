import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("a lista de empresas mostra a ligação ao TOConline (seed)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/empresas");

  // "Empresa Ligada Demo" tem toconline_company_id + toconline_cluster no seed.
  await expect(
    page.getByRole("row", { name: /Empresa Ligada Demo/ }).getByText("Ligada", { exact: true }),
  ).toBeVisible();

  // "Empresa Sem Ligação Demo" não tem essas colunas no seed.
  await expect(
    page
      .getByRole("row", { name: /Empresa Sem Ligação Demo/ })
      .getByText("Não ligada", { exact: true }),
  ).toBeVisible();
});

test("a edição da empresa ligada mostra a referência de acesso direto", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/empresas");

  await page
    .getByRole("row", { name: /Empresa Ligada Demo/ })
    .getByRole("link", { name: "Editar" })
    .click();
  await expect(page).toHaveURL(/\/empresas\/[0-9a-f-]+$/);

  // 515814 é o toconline_company_id fixado no seed para esta empresa.
  await expect(page.getByText("515814")).toBeVisible();
});
