# Observabilidade: o módulo de logs

Este sistema é, sobretudo, uma ferramenta de **integrações**. Precisamos rastrear **tudo** que
ocorre desde um gatilho inicial (webhook, agendamento, ação manual/usuário) até o último efeito.
O modelo é inspirado em _distributed tracing_ e persistido no Postgres.

> **Regra de ouro:** todo fluxo com efeito colateral **abre um `trace`** e encadeia `events`/`logs`
> via `@toc/core`. Se você está criando um evento novo no sistema, ele **tem** que gerar log aqui.

## Modelo (tabelas em `packages/db/src/schema/observability.ts`)

- **Trace** (`traces`) — contexto-raiz de UM gatilho (`root_trigger`: `webhook | schedule | manual | system`).
  Amarra tudo que decorre daquele disparo. Campos: `trigger_source`, `correlation_key`, `created_by`
  (uuid do usuário), `status` (`open | completed | failed`).
- **Event** (`events`) — cada acontecimento é um nó com `parent_event_id` (auto-referência),
  formando uma **árvore causal**: evento gatilho → filhos → netos. Tem `type`, `source`,
  `status` (`pending | in_progress | succeeded | failed | skipped`), `payload`, `error`, `duration_ms`.
- **Log** (`logs`) — linhas finas (`debug | info | warn | error` + `data`) penduradas num `event` (e no `trace`).

## Os dois tipos de evento

**1. Evento de usuário** — algo que um usuário do sistema faz (login, logout, troca de senha).
Muitas vezes é _one-shot_ (não gera cadeia). Mapeia para: `trace(rootTrigger: "manual", createdBy: userId)`
→ 1 event `user.<action>` → `complete`/`fail`. Use o atalho `recordUserEvent` (ver Receitas).
Um evento de usuário **pode** disparar eventos de sistema no futuro — nesse caso continue no mesmo trace.

**2. Evento de sistema** — ocorre em cadeia, feito pelo sistema. Há um **evento gatilho** (ex.: uma
requisição de API com sua resposta HTTP) e, a partir dele, uma série de eventos sequenciais. Todos
ficam ligados pelo mesmo trace. Mapeia para: `trace(rootTrigger: "schedule" | "system" | "webhook")`
→ evento gatilho → `child()` para cada passo → logs em cada passo.

> **Exemplo** (integração do dia 10): buscar uma empresa por API → chamar mais 2 APIs → usar um crawler.
> Isso é **um trace**. O evento gatilho `integration.fetch_company` tem a resposta como filho, e os
> 3 passos seguintes são `child()` do gatilho. Todos compartilham o mesmo `traceId`.

## Correlação (o "correlationID")

- **`traceId` É o correlationID que amarra a cadeia inteira.** Um gatilho → um trace → todos os
  events/logs decorrentes carregam esse `traceId`. É assim que "sabemos que aquele evento ocorreu
  dentro de um contexto próprio".
- **`parent_event_id`** = ligação causal DENTRO de um trace (request → response → chamadas seguintes).
- **`correlation_key`** = agrupamento de negócio ENTRE traces distintos (várias tentativas da
  mesma obrigação, ou vários jobs do mesmo lote). Opcional; passe em `startTrace`. Três formas
  convivem, por granularidade:
  - `client:<uuid>:period:YYYY-MM` — convenção genérica original: cliente e período já
    conhecidos ao abrir o trace.
  - `company:<uuid>:iva` (Módulo 1) — todas as tentativas de obter a guia de IVA de uma
    empresa, independentemente do período: ao enfileirar ainda não se sabe que período o
    portal vai devolver (é sempre "a declaração mais recente"), então o período não pode entrar
    na chave.
  - `team:<uuid>:iva` (Módulo 1) — o lote "Buscar todas" de uma equipe. O trace do lote
    (`job.batch_enqueued`) usa esta chave, mas **cada job que ele enfileira abre o seu próprio
    trace** com `company:<uuid>:iva` — um trace partilhado por todos os jobs do lote seria
    fechado pelo primeiro a terminar, e os restantes pendurariam eventos num trace já fechado.

## Taxonomia de `type` (`namespace.action`, dot.case)

Sempre nomeie eventos por namespace para manter os logs consultáveis:

| Namespace       | Uso                                                                                                                                                                                                                                             | `rootTrigger` típico  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `user.*`        | `user.login`, `user.logout`, `user.change_password`, `user.document_downloaded`                                                                                                                                                                 | `manual`              |
| `integration.*` | passo de alto nível (`integration.fetch_company`); Módulo 1: `integration.document_stored` (PDF gravado no Storage), `integration.obligation_recorded` (ledger atualizado)                                                                      | `schedule` / `system` |
| `http.*`        | chamada HTTP externa (`http.request`, `http.response`)                                                                                                                                                                                          | herda do trace        |
| `rpa.*`         | passos de crawler/Playwright (`rpa.navigate`, `rpa.extract`); Módulo 1: `rpa.at.session`, `rpa.at.iva_declaration`, `rpa.at.payment_document`, e `rpa.toconline.direct_access` (só rota A — Acesso Direto do TOConline, ainda não implementada) | herda do trace        |
| `job.*`         | fila (`job.enqueued`, `job.started`, `job.completed`); `job.batch_enqueued` (Módulo 1: o lote "Buscar todas")                                                                                                                                   | herda do trace        |
| `webhook.*`     | recebimento de webhook (`webhook.received`)                                                                                                                                                                                                     | `webhook`             |

`source` = componente emissor (`web`, `worker`).

**Trace aberto entre tentativas (Módulo 1):** quando um job de IVA falha de forma retentável
(`retry: true`) e ainda tem tentativas por gastar (`job.attempts < job.max_attempts`), o worker
**não fecha o trace** — a próxima tentativa da fila continua-o com `child()` a partir do mesmo
`job.started`. Só uma falha sem mais tentativas, ou não retentável, chama `trace.fail(...)`.
Fechar a cada tentativa partiria a cadeia causal da mesma obrigação em pedaços soltos, um por
tentativa, e o dashboard mostraria um trace "falhado" a meio de um trabalho que ainda está a
correr. Ver `IvaDocumentRunner.run` (`apps/worker/src/runner/iva-document-runner.ts`).

`user.document_downloaded` — payload `{ documentId }` — é emitido por
`GET /api/documents/:id/download` **antes** do 302 para a signed URL. Existe por dever de
prestação de contas do RGPD: o PDF é um documento de pagamento de um cliente e o acesso a
dados fiscais de terceiros tem de deixar rasto de quem e quando. O payload leva só o uuid do
documento — nunca o `storage_path` (é ele a chave do ficheiro no bucket) nem NIF/nome.

## Receitas

### Evento de usuário no app web (login/logout)

```ts
import { logUserEvent } from "@/lib/observability/tracer"; // fail-open

await logUserEvent({ action: "login", userId: user.id, data: { email } });
// falha: await logUserEvent({ action: "login", data: { email }, status: "failed", error: { message } });
```

`logUserEvent` **nunca lança** (fail-open): uma falha de observabilidade não pode quebrar o login.
No app web a escrita usa o `SupabaseStore` (service role) — ver `getWebTracer()`.

### Fluxo de sistema / integração

```ts
import { createTracer, SupabaseStore } from "@toc/core/observability";

const tracer = createTracer(new SupabaseStore(adminClient));
const trace = await tracer.startTrace({
  rootTrigger: "schedule",
  triggerSource: "cron:mensal",
  correlationKey: `client:${clientId}:period:2026-07`,
});

const trigger = await trace.event({ type: "integration.fetch_company", source: "worker" });
await trigger.log.info("buscando empresa", { clientId });

const resp = await trigger.child({ type: "http.response", source: "worker" });
await resp.succeed({ durationMs: 120 });

await trigger.succeed();
await trace.complete(); // ou trace.fail({ message }) se a cadeia falhou
```

### Worker (RPA, futuro)

Fora da Vercel há conexão `pg` direta, então use o `DbStore`:

```ts
import { createTracer, DbStore } from "@toc/core";
import { createDb } from "@toc/db";
const tracer = createTracer(new DbStore(createDb(process.env.DATABASE_URL!)));
```

## Checklist "sempre logar"

- [ ] O fluxo tem efeito colateral? Então **abra um `trace`**.
- [ ] Escolha o `type` pela **taxonomia** acima (`namespace.action`).
- [ ] Um gatilho = um trace. Passos subsequentes são `child()` (mesmo `traceId`).
- [ ] Resultado: `succeed()` (ok), `fail({ message })` (erro), **`skip(reason)`** para estados válidos
      que não são erro (ex.: "documento inexistente").
- [ ] Precisa correlacionar vários traces? Passe `correlationKey` (`client:<uuid>:period:YYYY-MM`).
- [ ] **RGPD/sigilo:** nunca coloque senha, segredo ou PII desnecessária em `payload`/`data`/`message`.
- [ ] Instrumentação **fail-open**: logar não pode quebrar o fluxo de negócio (envolva em try/catch onde apropriado).

## Testes

`packages/core` usa `InMemoryStore` para testar Tracer/Logger/`recordUserEvent` **sem banco**
(`test/user-events.test.ts`). O `SupabaseStore` é testado com um fake client
(`test/supabase-store.test.ts`); o `DbStore` é exercido por testes de integração com Supabase local.
No app web, o fluxo ponta a ponta (login → trace visível em `/logs`) é coberto por Playwright (`apps/web/e2e`).
