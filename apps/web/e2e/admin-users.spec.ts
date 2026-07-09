import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// Email único por execução — o BD de e2e não é isolado (dados acumulam).
const newEmail = `user+${Date.now()}@local.test`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe.serial("cadastro de usuário pelo admin", () => {
  let tempPassword = "";

  test("admin cria usuário e vê a senha temporária uma vez", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/traces/);

    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();

    await page.getByLabel("Email").fill(newEmail);
    await page.getByLabel("Nome completo").fill("Usuário Teste");
    await page.getByLabel("Papel").selectOption("member");
    await page.getByRole("button", { name: "Cadastrar" }).click();

    const status = page.getByRole("status");
    await expect(status).toContainText(newEmail);
    tempPassword = ((await status.locator("code").textContent()) ?? "").trim();
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);
  });

  test("novo usuário é forçado a trocar a senha no 1º acesso", async ({ page }) => {
    expect(tempPassword).not.toBe("");

    await login(page, newEmail, tempPassword);
    await expect(page).toHaveURL(/\/change-password/);

    const novaSenha = "NovaSenha123";
    await page.getByLabel("nova senha").fill(novaSenha);
    await page.getByLabel("confirmar senha").fill(novaSenha);
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page).toHaveURL(/\/traces/);
  });
});
