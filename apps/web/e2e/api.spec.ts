import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";
const DEMO_TEAM = "22222222-2222-2222-2222-222222222222";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("email").fill(ADMIN_EMAIL);
  await page.getByLabel("senha").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/traces/);
}

test("API sem sessão responde 401 JSON (não redireciona)", async ({ request }) => {
  const res = await request.get("/api/companies");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.ok).toBe(false);
});

test("API autenticada: cria empresa (201), lê por id (200) e lista (200)", async ({ page }) => {
  await login(page);

  const niss = `3${String(Date.now()).slice(-10)}`;
  const create = await page.request.post("/api/companies", {
    data: { niss, name: "Empresa API", type: "employer", teamId: DEMO_TEAM },
  });
  expect(create.status()).toBe(201);
  const created = await create.json();
  expect(created.ok).toBe(true);
  const id = created.data.id as string;

  const one = await page.request.get(`/api/companies/${id}`);
  expect(one.status()).toBe(200);
  expect((await one.json()).data.niss).toBe(Number(niss));

  const list = await page.request.get("/api/companies");
  expect(list.status()).toBe(200);
  const listBody = await list.json();
  expect(listBody.ok).toBe(true);
  expect(Array.isArray(listBody.data)).toBe(true);

  // GET /api/teams também responde 200 para admin.
  const teams = await page.request.get("/api/teams");
  expect(teams.status()).toBe(200);
});

test("API valida entrada: NISS inválido responde 400 com fieldErrors", async ({ page }) => {
  await login(page);
  const res = await page.request.post("/api/companies", {
    data: { niss: "123", name: "X", type: "employer", teamId: DEMO_TEAM },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.fieldErrors?.niss).toBeTruthy();
});
