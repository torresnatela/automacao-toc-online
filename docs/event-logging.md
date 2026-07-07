# Observabilidade: logs e eventos correlacionados

Sistema de integrações precisa rastrear **tudo** que ocorre desde um gatilho inicial
(webhook, agendamento, ação manual) até o último efeito. O modelo é inspirado em
_distributed tracing_ e persistido no Postgres.

## Modelo

- **Trace** (`traces`) — contexto-raiz por gatilho inicial (`root_trigger`:
  `webhook | schedule | manual | system`). Amarra tudo que decorre daquele disparo.
- **Event** (`events`) — cada acontecimento é um nó com `parent_event_id` (auto-referência),
  formando uma **árvore causal**: evento gatilho → filhos → netos. Tem `type`, `source`,
  `status` (`pending | in_progress | succeeded | failed | skipped`), `payload`, `error`,
  `duration_ms`.
- **Log** (`logs`) — linhas finas (`debug | info | warn | error` + `data`) penduradas num
  `event` (e no `trace`).

Assim é possível reconstruir "de um webhook até o último efeito" e depurar a cadeia inteira.

## API (`@toc/core`)

```ts
import { createTracer, DbStore } from "@toc/core";
import { createDb } from "@toc/db";

const tracer = createTracer(new DbStore(createDb(process.env.DATABASE_URL!)));

const trace = await tracer.startTrace({ rootTrigger: "webhook", triggerSource: "/api/hooks/x" });
const evt = await trace.event({ type: "webhook.received", source: "web" });
await evt.log.info("payload validado", { size });

const child = await evt.child({ type: "job.enqueued", source: "web" });
await child.succeed({ durationMs: 12 });

await evt.succeed(); // ou evt.fail({ message }) / evt.skip("documento inexistente")
await trace.complete(); // ou trace.fail({ message })
```

- `EventHandle.skip(reason)` cobre "documento inexistente" — resultado **válido**, não erro.
- Cada `log` também é emitido no stdout como JSON estruturado (observabilidade em runtime).

## Testes

`packages/core` usa `InMemoryStore` para testar Tracer/Logger **sem banco**. O `DbStore`
persiste de verdade e é exercido pelos testes de integração (com Supabase local).
