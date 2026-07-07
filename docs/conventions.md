# Convenções

## Fluxo de trabalho (Git)

- Branch a partir de `main` para cada feature/bugfix: `feat/...`, `fix/...`, `chore/...`.
- Abra PR → review da equipe → merge. CI (lint + typecheck + testes) roda em cada PR.
- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

## TDD

Padrão do projeto: **red → green → refactor**.

1. Escreva o teste que falha.
2. Rode e confirme que falha (pela razão certa).
3. Implemente o mínimo para passar.
4. Rode e confirme que passa.
5. Refatore com os testes verdes.
6. Commit.

Vitest para unit/integração; Playwright para e2e.

## Código

- **TypeScript strict** em todo o repo (`strict`, `noUncheckedIndexedAccess`).
- Imports relativos **sem extensão** dentro dos pacotes (resolvem com tsc Bundler, Vitest e Next).
- Arquivos focados, uma responsabilidade. Prefira dividir a crescer demais.
- Sem segredos no código. Só `.env` (git-ignored); `.env.example` documenta as chaves.
- ESLint + Prettier (config compartilhada em `packages/config`). Rode `pnpm lint` e `pnpm format`.

## Banco

- Schema em Drizzle é a fonte da verdade. Gere migrations com `pnpm db:generate`.
- SQL à mão só para RLS/policies/triggers (`*_rls.sql`).
- Migrations rodam via `pnpm db:*`, à parte do `pnpm dev`.

## Observabilidade

Todo fluxo com efeito colateral abre um `trace` e encadeia `events`/`logs` via `@toc/core`.
Ver [`event-logging.md`](event-logging.md).
