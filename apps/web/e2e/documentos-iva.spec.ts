import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";
const OPERATOR_EMAIL = "operator@local.test";
const OPERATOR_PASSWORD = "operator123";

// Do seed (supabase/seed.sql).
const DEMO_TEAM = "22222222-2222-2222-2222-222222222222";
const LIGADA = "Empresa Ligada Demo";
const SEM_LIGACAO = "Empresa Sem Ligação Demo";
const DE_OUTRO_GABINETE = "Empresa do Outro Gabinete";

// Espelha `IVA_DOCUMENT_JOB_TYPE` de `@toc/core/domain`. Escrito à mão porque o
// Playwright não transforma o TypeScript dos pacotes do workspace; a mesma
// string está pinada por `iva-documents.smoke.test.ts` do lado do domínio.
const IVA_JOB_TYPE = "rpa.fetch_iva_document";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// A montagem (credencial da AT, fila limpa) faz-se pela REST do Supabase com a
// service role: o ecrã que guarda a credencial da AT é a Task 13, e sem ele não
// há como pôr o sistema no estado "pronto a buscar" pela interface.
test.skip(
  SUPABASE_URL === "" || SERVICE_ROLE === "",
  "precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (carregue o .env)",
);

// A rota A guarda a senha da AT do lado do TOConline, portanto a cópia dos
// botões desativados é outra e o seed não a satisfaz. Este ficheiro é da rota B.
test.skip(
  process.env.AT_ACCESS_MODE === "toconline_direct_access",
  "escrito para a rota B (at_direct_login), a que o .env.example define",
);

// Os testes partilham a credencial e a fila: em paralelo, o que limpa a fila
// apagaria o job que o outro acabou de enfileirar.
test.describe.configure({ mode: "serial" });

/**
 * Chamada à REST do Supabase com a service role.
 *
 * `fetch` global e não a fixture `request` do Playwright de propósito: `request`
 * é de âmbito *test* e não existe dentro de `beforeAll`/`afterAll`, que é
 * precisamente onde a montagem tem de acontecer.
 */
async function rest(path: string, init: RequestInit = {}): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  }
}

/**
 * Apaga **todos** os jobs de IVA da equipa demo, não só os pendentes.
 *
 * Os pendentes porque no e2e não há worker que os termine e o segundo clique
 * de uma corrida anterior deixaria de ser o primeiro. Os terminados porque
 * `onlyMissing` olha para o último desfecho do mês: uma guia dada por obtida
 * numa corrida anterior faria o «buscar todas» seguinte saltar a empresa.
 */
async function limparFila(): Promise<void> {
  await rest(`jobs?team_id=eq.${DEMO_TEAM}&type=eq.${IVA_JOB_TYPE}`, { method: "DELETE" });
}

async function apagarCredencialAt(): Promise<void> {
  await rest(`integration_credentials?team_id=eq.${DEMO_TEAM}&provider=eq.at&company_id=is.null`, {
    method: "DELETE",
  });
}

/**
 * Credencial da AT da equipa, com um ciphertext de fachada: nada nesta task o
 * decifra (quem o faria é o worker, que aqui não corre) — o que se prova é que
 * a presença da credencial desbloqueia o botão.
 */
async function criarCredencialAt(): Promise<void> {
  await apagarCredencialAt();
  await rest("integration_credentials", {
    method: "POST",
    body: JSON.stringify({
      team_id: DEMO_TEAM,
      provider: "at",
      username: "123456789",
      secret_encrypted: "v1:x:y:z",
      status: "active",
    }),
  });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A linha da tabela de uma empresa, pelo nome. */
function linha(page: Page, empresa: string) {
  return page.getByRole("row").filter({ hasText: empresa });
}

test.beforeAll(async () => {
  await limparFila();
  await apagarCredencialAt();
});

test.afterAll(async () => {
  await limparFila();
  await apagarCredencialAt();
});

test("sem credencial da AT nenhuma empresa é buscável, e o botão diz porquê", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);
  await expect(page.getByRole("heading", { name: "Guias de IVA" })).toBeVisible();

  await expect(linha(page, LIGADA)).toBeVisible();
  await expect(linha(page, SEM_LIGACAO)).toBeVisible();

  for (const empresa of [LIGADA, SEM_LIGACAO]) {
    const botao = linha(page, empresa).getByRole("button", { name: /Buscar/ });
    await expect(botao).toBeDisabled();
    await expect(botao).toHaveAttribute("title", "Configure o acesso à AT.");
  }
});

test("com credencial, buscar enfileira uma vez e o lote resume o que saltou", async ({ page }) => {
  await criarCredencialAt();

  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  // Segundo separador aberto **antes** do clique: é a corrida real (dois
  // operadores, ou o mesmo ecrã esquecido aberto) e a única forma honesta de
  // chegar ao caminho do duplicado — depois do primeiro clique o botão desta
  // página já se desativa sozinho.
  const desatualizada = await page.context().newPage();
  await desatualizada.goto(`/documentos/iva?team=${DEMO_TEAM}`);
  await expect(linha(desatualizada, LIGADA).getByRole("button", { name: "Buscar" })).toBeEnabled();

  await linha(page, LIGADA).getByRole("button", { name: "Buscar" }).click();
  // Escopado à linha: cada botão tem o seu `role="status"`, e o resumo do lote
  // acrescenta mais um — um `getByRole` solto casaria vários.
  await expect(linha(page, LIGADA).getByRole("status")).toHaveText("Busca enfileirada.");

  // Sem worker no e2e o job fica em "Na fila" — é isso que torna a asserção
  // determinística.
  await expect(linha(page, LIGADA).getByText("Na fila")).toBeVisible();
  await expect(linha(page, LIGADA).getByRole("button", { name: /Buscar/ })).toBeDisabled();

  await linha(desatualizada, LIGADA).getByRole("button", { name: "Buscar" }).click();
  await expect(linha(desatualizada, LIGADA).getByRole("status")).toHaveText(
    "Já existe uma busca em curso para esta empresa.",
  );
  await desatualizada.close();

  // O lote: uma empresa já em curso, a outra por buscar.
  await page.getByRole("button", { name: "Buscar todas" }).click();
  const resumo = page.getByRole("status").filter({ hasText: "enfileiradas" });
  await expect(resumo).toHaveText(/\d+ enfileiradas · \d+ já em curso/);
  await expect(linha(page, SEM_LIGACAO).getByText("Na fila")).toBeVisible();
});

test("o operador vê as empresas da sua equipa e nenhuma de outra", async ({ page }) => {
  await login(page, OPERATOR_EMAIL, OPERATOR_PASSWORD);
  // Sem `?team=`: a equipa do operador está fixada no perfil.
  await page.goto("/documentos/iva");
  await expect(page.getByRole("heading", { name: "Guias de IVA" })).toBeVisible();

  await expect(linha(page, LIGADA)).toBeVisible();
  await expect(linha(page, SEM_LIGACAO)).toBeVisible();
  await expect(linha(page, DE_OUTRO_GABINETE)).toHaveCount(0);
});
