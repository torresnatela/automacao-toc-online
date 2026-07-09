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
  await expect(page.getByText("TOConline")).toBeVisible();
  await expect(page.getByText("e-Fatura")).toBeVisible();
});

test("login gera um evento user.login visível no drill-down de /logs", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();

  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();

  // O login que acabamos de fazer é o trace 'manual' mais recente (topo da lista).
  await page.getByRole("link", { name: "manual" }).first().click();
  await expect(page.getByText("user.login")).toBeVisible();
});
