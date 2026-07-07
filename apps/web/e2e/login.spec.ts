import { test, expect } from "@playwright/test";

test("visitante não autenticado é redirecionado para /login", async ({ page }) => {
  await page.goto("/traces");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
