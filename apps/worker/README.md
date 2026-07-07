# @toc/worker (scaffold)

Worker persistente de RPA (Node + Playwright). Ainda **não implementado**.

Consumirá a fila `jobs`, executará a automação dos portais (TOConline, AT, Segurança
Social, e-Fatura) e registrará cada passo via `@toc/core` (Tracer/Logger), ligado ao
trace de origem.

Roda **fora da Vercel** (Fly.io / Railway / container), pois exige processo de longa
duração e um browser real — incompatível com o modelo serverless.

## Comandos

- `pnpm --filter @toc/worker dev` — roda o entrypoint em watch (Node 24, TS nativo).
- `pnpm --filter @toc/worker typecheck` — checagem de tipos.
