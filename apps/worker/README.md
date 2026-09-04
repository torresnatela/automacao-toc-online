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

## Módulo 1 — guias de IVA (AT)

O worker regista dois tipos de job: `rpa.scan_companies` (varredura do TOConline) e
`rpa.fetch_iva_document` (guia de pagamento do IVA no Portal das Finanças). Ambos são
servidos pelo mesmo ciclo serial — automatizamos portais de terceiros, sem pressa.

### Variáveis de ambiente

Todas têm valor por omissão: um worker que só faça varredura não deixa de arrancar por
causa de configuração deste módulo. Ver `.env.example` na raiz.

| Variável                              | Omissão           | Para que serve                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AT_ACCESS_MODE`                      | `at_direct_login` | Rota de acesso à AT. `at_direct_login` (login do gabinete no `acesso.gov.pt`) ou `toconline_direct_access` (Acesso Direto do TOConline — **ainda não implementado**: o worker falha no arranque). Decidido na Fase 0. Um valor desconhecido **lança** em vez de cair no default. |
| `DOCUMENTS_BUCKET`                    | `documents`       | Bucket do Supabase Storage onde ficam os PDFs.                                                                                                                                                                                                                                   |
| `AT_PACING_MS`                        | `5000`            | Ritmo mínimo entre jobs de IVA (182 empresas ≈ 30 min, de propósito).                                                                                                                                                                                                            |
| `AT_DAILY_ATTEMPT_CAP`                | `5`               | Tentativas por empresa por dia. Três recusas de senha trancam a conta da AT.                                                                                                                                                                                                     |
| `AT_PORTAL_PAUSE_MS`                  | `900000`          | Pausa geral do acesso à AT depois de uma indisponibilidade.                                                                                                                                                                                                                      |
| `RPA_CHROME_USER_DATA_DIR`            | —                 | Só rota A: perfil de um Chrome real.                                                                                                                                                                                                                                             |
| `RPA_CHROME_EXTENSION_DIR`            | —                 | Só rota A: extensão do TOConline a carregar nesse Chrome.                                                                                                                                                                                                                        |
| `AT_RECON_USER` / `AT_RECON_PASSWORD` | —                 | Só para os scripts abaixo (headed, com uma pessoa ao lado). Nunca lidas pelo worker.                                                                                                                                                                                             |

### Correr o worker

```sh
set -a && . ./.env && set +a          # a partir da raiz do repo
pnpm --filter @toc/worker dev         # tsx watch
```

O arranque loga uma linha JSON com `handles` (os dois tipos) e `atAccessMode`. `Ctrl+C`
encerra limpo (fecha o Chromium).

### Scripts manuais (Fase 0)

Nenhum dos dois é automação: os dois abrem um browser **visível** e param
(`page.pause()`) para uma pessoa conduzir. Credenciais **só por ambiente** — nunca por
argumento, nunca da base de dados, nunca gravadas.

Nem o `pnpm` nem o `tsx` leem o `.env` sozinhos: os comandos abaixo levam o mesmo
preâmbulo do bloco "Correr o worker" e correm-se **a partir da raiz do repo**.

- `scripts/recon-at.ts` — reconhecimento do portal, para substituir os `TODO(recon)` de
  `src/at/selectors.ts` e `src/at/wording.ts`.

  ```sh
  set -a && . ./.env && set +a && \
    pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route b --nif 123456789
  set -a && . ./.env && set +a && \
    pnpm --filter @toc/worker exec tsx scripts/recon-at.ts --route a --company 4321:5
  ```

  Escreve em `apps/worker/recon/<yyyy-mm-dd-HHmm>/` (git-ignored). Cada etapa é
  fotografada **duas vezes**: `antes` (a página como o portal a entregou, antes de
  alguém lhe tocar) e `depois` (o que a ação produziu) — é o `antes` que carrega os
  seletores a copiar, e que se perderia se só se fotografasse com o humano já noutra
  página. Por momento: `NN-<stage>.<antes|depois>.png` (página inteira),
  `NN-<stage>.<antes|depois>.fingerprint.json` (assinatura com dígitos mascarados) e
  `NN-<stage>.<antes|depois>.forms.json` (nomes/tipos/ids dos campos, **nunca
  valores**); popups apanhados no momento ganham `.popupK.png`. Ao longo da sessão:
  `network.jsonl` (método, URL sem query, status, `content-type`,
  `content-disposition`), `pages.jsonl` (popups) e `downloads.jsonl` (nome sugerido e
  tamanho — o PDF em si não é guardado).

  **Os screenshots contêm dados reais de contribuintes.** Partilhe-os só pelo canal
  seguro do gabinete; para o repo vão apenas as tabelas resumidas em
  `docs/superpowers/specs/<data>-at-recon.md`.

- `scripts/seed-at-session.ts` — sessão assistida. É a saída operacional quando o 2FA da
  AT for obrigatório: a pessoa faz o login uma vez e o `storageState` fica guardado na
  chave que o worker lê (`at:team:<id>` / `at:company:<id>`, em `RPA_STATE_DIR`, modo
  0600).

  ```sh
  set -a && . ./.env && set +a && \
    pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --team <teamId>
  set -a && . ./.env && set +a && \
    pnpm --filter @toc/worker exec tsx scripts/seed-at-session.ts --company <companyId>
  ```
