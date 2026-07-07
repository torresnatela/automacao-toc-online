## O que muda

<!-- Descreva a mudança em 1-3 frases. -->

## Por quê

<!-- Contexto / motivação / issue relacionada. -->

## Como testar

<!-- Passos para o revisor validar localmente. -->

## Checklist

- [ ] TDD: testes escritos antes / cobrindo a mudança
- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdes localmente
- [ ] Migrations (se houver) geradas via `pnpm db:generate` e aplicadas com `pnpm db:reset`
- [ ] Sem segredos commitados (`.env` fora do git)
- [ ] Docs atualizadas quando necessário
