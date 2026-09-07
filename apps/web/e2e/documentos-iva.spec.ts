import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "admin123";
const OPERATOR_EMAIL = "operator@local.test";
const OPERATOR_PASSWORD = "operator123";

// Do seed (supabase/seed.sql).
const DEMO_TEAM = "22222222-2222-2222-2222-222222222222";
const OUTRO_TEAM = "55555555-5555-5555-5555-555555555555";
const TEAM_VAZIA = "66666666-6666-6666-6666-666666666666";
const LIGADA = "Empresa Ligada Demo";
const LIGADA_ID = "33333333-3333-3333-3333-333333333333";
const SEM_LIGACAO = "Empresa Sem Ligação Demo";
const SEM_FICHEIRO = "Empresa Sem Ficheiro Demo";
const DE_OUTRO_GABINETE = "Empresa do Outro Gabinete";

// Espelha `IVA_DOCUMENT_JOB_TYPE` de `@toc/core/domain`. Escrito à mão porque o
// Playwright não transforma o TypeScript dos pacotes do workspace; a mesma
// string está pinada por `iva-documents.smoke.test.ts` do lado do domínio.
const IVA_JOB_TYPE = "rpa.fetch_iva_document";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// A montagem (credenciais, fila limpa) faz-se pela REST do Supabase com a
// service role: o job já concluído que a listagem mostra teria de vir de um
// worker, que aqui não corre.
test.skip(
  SUPABASE_URL === "" || SERVICE_ROLE === "",
  "precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (carregue o .env)",
);

// Os casos partilham as credenciais, a fila e o job já concluído: em paralelo, o
// que limpa a fila apagaria o job que o outro acabou de enfileirar. E são
// encadeados de propósito — cada um deixa o sistema no estado que o seguinte
// espera, que é como o gabinete o vive de manhã.
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

/** A mesma chamada, mas a LER: devolve o JSON (sem `return=minimal`). */
async function restGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
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
 * Credencial da AT da equipa, com um ciphertext de fachada: nada nesta suite o
 * decifra (quem o faria é o worker, que aqui não corre) — o que se prova é que
 * a presença da credencial desbloqueia o «Buscar».
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

async function apagarCredencialToconline(): Promise<void> {
  await rest(
    `integration_credentials?team_id=eq.${DEMO_TEAM}&provider=eq.toconline&company_id=is.null`,
    { method: "DELETE" },
  );
}

/**
 * Ligação ao TOConline da equipa, também de fachada — é o que o «Buscar via
 * TOConline» exige antes de sequer olhar para a ligação de cada empresa.
 * Apagar-e-criar sempre: `integracoes-toconline.spec.ts` guarda uma pelo ecrã,
 * e a montagem deste ficheiro não pode depender da ordem dos ficheiros.
 */
async function criarCredencialToconline(): Promise<void> {
  await apagarCredencialToconline();
  await rest("integration_credentials", {
    method: "POST",
    body: JSON.stringify({
      team_id: DEMO_TEAM,
      provider: "toconline",
      username: "gabinete@local.test",
      secret_encrypted: "v1:x:y:z",
      status: "active",
    }),
  });
}

/**
 * O job que o worker teria escrito ao trazer a guia de julho.
 *
 * A listagem completa mostra o **desfecho** do último job (crachá, linha curta,
 * orientação), e sem worker no e2e não há outra forma de o ter. `result` na
 * forma que a view achata (`result->>'outcome'`, `result->>'period'`) — é a
 * mesma que `readIvaOutcome` lê do lado do domínio.
 */
async function criarJobObtido(): Promise<void> {
  await limparFila();
  await rest("jobs", {
    method: "POST",
    body: JSON.stringify({
      team_id: DEMO_TEAM,
      company_id: LIGADA_ID,
      type: IVA_JOB_TYPE,
      status: "succeeded",
      attempts: 1,
      result: { outcome: "fetched", period: "2026-07" },
      finished_at: new Date().toISOString(),
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

/**
 * Um botão pelo nome acessível **exato**.
 *
 * O `name` do `getByRole` casa por substring: «Buscar» casaria também «Buscar
 * via TOConline», «Buscar todas» casaria «Buscar todas via TOConline» — e o
 * modo estrito do Playwright recusaria o clique por haver dois. Cada rota tem o
 * seu botão, e cada caso diz qual quer.
 */
function botao(scope: Page | Locator, name: string) {
  return scope.getByRole("button", { name, exact: true });
}

/**
 * Os banners de prontidão das credenciais, um por rota.
 *
 * Filtrados pelo texto e não por `getByRole("alert")` solto porque o Next em
 * desenvolvimento injeta na página um `role="alert"` vazio (o indicador das
 * dev tools) — contá-lo faria "não há banner" ser sempre falso.
 */
function bannerAt(page: Page) {
  return page.getByRole("alert").filter({ hasText: "acesso à AT" });
}

function bannerToconline(page: Page) {
  return page.getByRole("alert").filter({ hasText: "ligação ao TOConline" });
}

/**
 * Uma sessão de admin para todos os casos que a usam.
 *
 * A fixture `page` obrigaria a um login por caso, e o GoTrue local corta aos 30
 * sign-ins por 5 minutos por IP (`sign_in_sign_ups`, em `supabase/config.toml`)
 * — a suíte inteira já anda perto desse tecto. Como os casos partilham a
 * página, o ficheiro corre em `serial` (ver acima).
 */
const admin = { context: null as unknown as BrowserContext, page: null as unknown as Page };

test.beforeAll(async ({ browser }) => {
  await limparFila();
  await apagarCredencialAt();
  await apagarCredencialToconline();
  // Contexto explícito (e não `browser.newPage()`): os casos da corrida precisam
  // de um SEGUNDO separador com a mesma sessão, e só um contexto criado à mão
  // deixa abrir mais páginas dentro dele.
  admin.context = await browser.newContext();
  admin.page = await admin.context.newPage();
  await login(admin.page, ADMIN_EMAIL, ADMIN_PASSWORD);
});

test.afterAll(async () => {
  try {
    await limparFila();
    await apagarCredencialAt();
    await apagarCredencialToconline();
  } finally {
    await admin.context?.close();
  }
});

test("sem credenciais os banners explicam, e nenhuma empresa é buscável por rota nenhuma", async () => {
  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);
  await expect(page.getByRole("heading", { name: "Guias de IVA" })).toBeVisible();

  // Um banner por rota: cada um diz uma vez o que os seus 182 botões desligados
  // diriam cada um por si, e leva ao ecrã que resolve a SUA credencial.
  const avisoAt = bannerAt(page);
  await expect(avisoAt).toContainText("Configure o acesso à AT antes de buscar guias.");
  await expect(avisoAt.getByRole("link")).toHaveAttribute("href", "/integracoes/at");
  const avisoToconline = bannerToconline(page);
  await expect(avisoToconline).toContainText(
    "Configure a ligação ao TOConline antes de buscar guias.",
  );
  await expect(avisoToconline.getByRole("link")).toHaveAttribute("href", "/integracoes/toconline");

  await expect(linha(page, LIGADA)).toBeVisible();
  await expect(linha(page, SEM_LIGACAO)).toBeVisible();

  for (const empresa of [LIGADA, SEM_LIGACAO]) {
    const rotaB = botao(linha(page, empresa), "Buscar");
    await expect(rotaB).toBeDisabled();
    await expect(rotaB).toHaveAttribute("title", "Configure o acesso à AT.");

    // A prontidão olha à credencial do gabinete antes da ligação de cada
    // empresa: sem ligação ao TOConline guardada, o motivo é o mesmo nas duas.
    const rotaA = botao(linha(page, empresa), "Buscar via TOConline");
    await expect(rotaA).toBeDisabled();
    await expect(rotaA).toHaveAttribute("title", "Configure a ligação ao TOConline.");
  }

  // Nada pronto por rota nenhuma: nenhum lote se abre — e cada um diz porquê.
  for (const nome of ["Buscar todas", "Buscar todas via TOConline"]) {
    const todas = botao(page, nome);
    await expect(todas).toBeDisabled();
    await expect(todas).toHaveAttribute("title", "Nenhuma empresa pronta para buscar.");
  }
});

test("uma equipa sem empresas mostra o estado vazio, não uma tabela vazia", async () => {
  const page = admin.page;
  await page.goto(`/documentos/iva?team=${TEAM_VAZIA}`);

  await expect(page.getByText("Nenhuma empresa nesta equipa")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver empresas" })).toHaveAttribute(
    "href",
    "/empresas",
  );
  await expect(page.getByRole("row")).toHaveCount(0);
});

test("a listagem mostra a guia obtida com entidade, referência, valor e PDF", async () => {
  await criarCredencialAt();
  await criarCredencialToconline();
  await criarJobObtido();

  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  const guia = linha(page, LIGADA);
  await expect(guia).toContainText("Guia obtida");
  await expect(guia).toContainText("julho de 2026");
  await expect(guia).toContainText("11111");
  await expect(guia).toContainText("123456789012345");
  // O Intl pt-PT do Node não agrupa os milhares até cinco dígitos e usa espaço
  // não separável antes do símbolo: o `\s?` aceita as duas formas sem depender
  // do byte exato de uma versão de ICU.
  await expect(guia).toContainText(/1\s?234,56\s?€/);
  await expect(guia).toContainText("25/09/2026");
  await expect(guia.getByRole("link", { name: "PDF" })).toBeVisible();

  // Com as duas credenciais guardadas os banners desaparecem — é a ausência
  // deles que diz ao gabinete que está tudo em ordem.
  await expect(bannerAt(page)).toHaveCount(0);
  await expect(bannerToconline(page)).toHaveCount(0);

  // Documento sem ficheiro no storage: a linha existe, o link não.
  await expect(linha(page, SEM_FICHEIRO).getByRole("link", { name: "PDF" })).toHaveCount(0);
});

test("«Enviar ao cliente» marca a guia como enviada e confirma (email simulado)", async () => {
  const DOC_LIGADA = "77777777-7777-7777-7777-777777777777";
  try {
    const page = admin.page;
    await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

    const guia = linha(page, LIGADA);
    await botao(guia, "Enviar ao cliente").click();

    // A confirmação diz, com todas as letras, que é simulado — e a guia deixa
    // de oferecer o envio outra vez.
    await expect(guia.getByText("Enviada por email (simulado)")).toBeVisible();
    await expect(botao(guia, "Enviar ao cliente")).toHaveCount(0);

    // O estado ficou mesmo persistido como enviado.
    const docs = await restGet<{ status: string }[]>(
      `documents?id=eq.${DOC_LIGADA}&select=status`,
    );
    expect(docs[0]?.status).toBe("sent");
  } finally {
    // A guia do seed é partilhada por outros testes: repor o estado.
    await rest(`documents?id=eq.${DOC_LIGADA}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "extracted", sent_at: null }),
    });
  }
});

test("os detalhes de uma linha abrem num diálogo com a orientação completa", async () => {
  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  await linha(page, LIGADA).getByRole("button", { name: "Detalhes" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByRole("heading", { name: LIGADA })).toBeVisible();
  await expect(dialogo).toContainText("Guia de julho de 2026 guardada");
  await expect(dialogo).toContainText("pagamento até 25/09/2026");
  // O caminho da resolução vem com a orientação, e não no menu.
  await expect(dialogo.getByRole("link", { name: "Editar empresa" })).toHaveAttribute(
    "href",
    `/empresas/${LIGADA_ID}`,
  );
  // E as duas formas de voltar a tentar, no mesmo sítio onde se lê o porquê.
  await expect(botao(dialogo, "Buscar novamente")).toBeVisible();
  await expect(botao(dialogo, "Buscar novamente via TOConline")).toBeVisible();

  // `.first()`: o `DialogContent` do design system já traz o seu X no canto,
  // com o mesmo nome acessível ("Fechar"). O primeiro na ordem do DOM é o do
  // rodapé, que é o que este caso quer exercitar.
  await dialogo.getByRole("button", { name: "Fechar" }).first().click();
  await expect(dialogo).toHaveCount(0);
});

test("o admin troca de equipa pelo seletor e a tabela acompanha", async () => {
  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  await page.getByLabel("Equipa").selectOption({ label: "Gabinete Outro" });

  await expect(page).toHaveURL(new RegExp(`team=${OUTRO_TEAM}`));
  await expect(linha(page, DE_OUTRO_GABINETE)).toBeVisible();
  await expect(linha(page, LIGADA)).toHaveCount(0);
});

test("«Buscar via TOConline» só se liga onde há ligação ao TOConline", async () => {
  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  // Na rota A quem identifica a empresa no portal é o TOConline: sem ligação, o
  // botão desliga-se e diz o que fazer — a varredura, não a credencial.
  const semLigacao = linha(page, SEM_LIGACAO);
  const rotaA = botao(semLigacao, "Buscar via TOConline");
  await expect(rotaA).toBeDisabled();
  await expect(rotaA).toHaveAttribute("title", "Sem ligação ao TOConline — corra a varredura.");
  await expect(semLigacao.getByText("Sem ligação TOConline", { exact: true })).toBeVisible();
  // Na rota B a mesma empresa busca-se na mesma, pelo NIF.
  await expect(botao(semLigacao, "Buscar")).toBeEnabled();

  await expect(botao(linha(page, LIGADA), "Buscar novamente via TOConline")).toBeEnabled();
});

test("buscar via TOConline enfileira pela rota A e a linha diz por que rota", async () => {
  await criarJobObtido();

  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  // Segundo separador aberto **antes** do clique, com a OUTRA rota à espera: um
  // job em curso é um job em curso seja qual for a rota que o abriu — o índice
  // de idempotência é por empresa, não por rota.
  const desatualizada = await page.context().newPage();
  await desatualizada.goto(`/documentos/iva?team=${DEMO_TEAM}`);
  await expect(botao(linha(desatualizada, LIGADA), "Buscar novamente")).toBeEnabled();

  await botao(linha(page, LIGADA), "Buscar novamente via TOConline").click();
  // Escopado à linha: cada botão tem o seu `role="status"`, e o resumo do lote
  // acrescenta mais um — um `getByRole` solto casaria vários.
  await expect(linha(page, LIGADA).getByRole("status")).toHaveText("Busca enfileirada.");

  // Sem worker no e2e o job fica em "Na fila" — e a linha diz por que rota vai
  // correr, ao lado do estado.
  await expect(linha(page, LIGADA).getByText("Na fila")).toBeVisible();
  await expect(
    linha(page, LIGADA).getByText("Aguarda o worker · via TOConline", { exact: true }),
  ).toBeVisible();
  // Em curso, as DUAS rotas ficam desligadas.
  await expect(botao(linha(page, LIGADA), "Buscar")).toBeDisabled();
  await expect(botao(linha(page, LIGADA), "Buscar via TOConline")).toBeDisabled();

  // O que ficou na fila é um job da rota A, forçado (era uma re-busca).
  const pendentes = await restGet<{ payload: { access?: string; force?: boolean } }[]>(
    `jobs?company_id=eq.${LIGADA_ID}&type=eq.${IVA_JOB_TYPE}&status=eq.pending&select=payload`,
  );
  expect(pendentes).toHaveLength(1);
  expect(pendentes[0]?.payload.access).toBe("toconline_direct_access");
  expect(pendentes[0]?.payload.force).toBe(true);

  // A corrida entre rotas: o «Buscar novamente» (rota B) do separador antigo
  // encontra o job da rota A em curso e não abre um segundo.
  await botao(linha(desatualizada, LIGADA), "Buscar novamente").click();
  await expect(linha(desatualizada, LIGADA).getByRole("status")).toHaveText(
    "Já existe uma busca em curso para esta empresa.",
  );
  await desatualizada.close();
});

test("o lote via TOConline conta só as empresas ligadas", async () => {
  // Fila limpa: o job da rota A do caso anterior contaria como «em curso», e
  // uma guia dada por obtida faria `onlyMissing` saltar a única empresa ligada.
  await limparFila();

  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  await botao(page, "Buscar todas via TOConline").click();
  const confirmacao = page.getByRole("dialog");
  await expect(confirmacao.getByRole("heading")).toContainText("via TOConline");
  // Só UMA empresa da equipa tem ligação ao TOConline — e o diálogo diz o
  // número, e o motivo das outras, **antes** de enfileirar. As não prontas não
  // se contam ao certo: outros specs (empresas, API) deixam empresas sem ligação
  // na equipa demo, e o que importa é que nenhuma delas entra no lote.
  await expect(confirmacao).toContainText(/Vai enfileirar\s*1\b/);
  await expect(confirmacao).toContainText("sem ligação ao TOConline");
  await confirmacao.getByRole("button", { name: /Enfileirar/ }).click();

  const resumo = page.getByRole("status").filter({ hasText: "enfileiradas" });
  await expect(resumo).toHaveText(/1 enfileiradas · 0 já em curso · \d+ não prontas/);
  await expect(confirmacao).toHaveCount(0);

  await expect(
    linha(page, LIGADA).getByText("Aguarda o worker · via TOConline", { exact: true }),
  ).toBeVisible();
  await expect(linha(page, SEM_LIGACAO).getByText("Na fila")).toHaveCount(0);
});

test("com credencial, buscar enfileira uma vez e o lote confirma antes de encher a fila", async () => {
  await criarJobObtido();

  const page = admin.page;
  await page.goto(`/documentos/iva?team=${DEMO_TEAM}`);

  // A guia de julho já está guardada: o verbo passa a «Buscar novamente», e é
  // esse clique que tem de forçar a re-busca (senão o worker fecharia o job
  // como `already_fetched` e nada mudaria no ecrã).
  await expect(botao(linha(page, LIGADA), "Buscar novamente")).toBeEnabled();

  // Segundo separador aberto **antes** do clique: é a corrida real (dois
  // operadores, ou o mesmo ecrã esquecido aberto) e a única forma honesta de
  // chegar ao caminho do duplicado — depois do primeiro clique o botão desta
  // página já se desativa sozinho.
  const desatualizada = await page.context().newPage();
  await desatualizada.goto(`/documentos/iva?team=${DEMO_TEAM}`);
  await expect(botao(linha(desatualizada, LIGADA), "Buscar novamente")).toBeEnabled();

  await botao(linha(page, LIGADA), "Buscar novamente").click();
  // Escopado à linha: cada botão tem o seu `role="status"`, e o resumo do lote
  // acrescenta mais um — um `getByRole` solto casaria vários.
  await expect(linha(page, LIGADA).getByRole("status")).toHaveText("Busca enfileirada.");

  // Sem worker no e2e o job fica em "Na fila" — é isso que torna a asserção
  // determinística. E em curso, as DUAS rotas ficam desligadas.
  await expect(linha(page, LIGADA).getByText("Na fila")).toBeVisible();
  await expect(
    linha(page, LIGADA).getByText("Aguarda o worker · login direto na AT", { exact: true }),
  ).toBeVisible();
  await expect(botao(linha(page, LIGADA), "Buscar")).toBeDisabled();
  await expect(botao(linha(page, LIGADA), "Buscar via TOConline")).toBeDisabled();

  await botao(linha(desatualizada, LIGADA), "Buscar novamente").click();
  await expect(linha(desatualizada, LIGADA).getByRole("status")).toHaveText(
    "Já existe uma busca em curso para esta empresa.",
  );
  await desatualizada.close();

  // O lote: uma empresa já em curso, as outras por buscar. E o diálogo diz o
  // número **antes** de abrir dezenas de sessões contra o portal.
  await botao(page, "Buscar todas").click();
  const confirmacao = page.getByRole("dialog");
  await expect(confirmacao).toContainText("Vai enfileirar");
  await expect(confirmacao).toContainText("já estão em curso");
  await confirmacao.getByRole("button", { name: /Enfileirar/ }).click();

  const resumo = page.getByRole("status").filter({ hasText: "enfileiradas" });
  await expect(resumo).toHaveText(/\d+ enfileiradas · \d+ já em curso/);
  await expect(confirmacao).toHaveCount(0);
  await expect(linha(page, SEM_LIGACAO).getByText("Na fila")).toBeVisible();

  // E o lote passa a ter progresso próprio, lido das mesmas linhas da tabela.
  await expect(page.getByText(/Lote em curso:/)).toBeVisible();
});

test("o operador vê as empresas da sua equipa e nenhuma de outra", async ({ page }) => {
  await login(page, OPERATOR_EMAIL, OPERATOR_PASSWORD);
  // Sem `?team=`: a equipa do operador está fixada no perfil.
  await page.goto("/documentos/iva");
  await expect(page.getByRole("heading", { name: "Guias de IVA" })).toBeVisible();

  await expect(linha(page, LIGADA)).toBeVisible();
  await expect(linha(page, SEM_LIGACAO)).toBeVisible();
  await expect(linha(page, DE_OUTRO_GABINETE)).toHaveCount(0);

  // O seletor de equipa é do admin: quem tem equipa fixa não o vê.
  await expect(page.getByLabel("Equipa")).toHaveCount(0);
});
