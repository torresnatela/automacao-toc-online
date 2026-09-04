import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";

// Nome único por execução — o BD de e2e é partilhado; a equipa criada é apagada no fim
// (via REST com a service role, quando o .env está carregado) para não acumular.
const teamName = `Gabinete E2E ${Date.now()}`;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test.afterAll(async () => {
  if (SUPABASE_URL === "" || SERVICE_ROLE === "") return; // sem chave, fica como antes
  const res = await fetch(`${SUPABASE_URL}/rest/v1/teams?name=eq.${encodeURIComponent(teamName)}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    throw new Error(`limpeza da equipa de e2e → ${res.status} ${await res.text()}`);
  }
});

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
