# Design System Cliconta + Reformulação do Front-end — Design

- **Data:** 2026-07-21
- **Branch:** `feat/companies-teams` (PR #3)
- **Autor:** brainstorming com o utilizador
- **Estado:** aprovado para escrever plano de implementação

## 1. Objetivo

Criar um **design system** (tokens + biblioteca de componentes) inspirado fielmente na
identidade visual da **Cliconta** e reformular **toda** a superfície de front-end do
`apps/web` para esse padrão, incluindo as telas novas trazidas pelo PR #3 (Empresas e
Equipes). Hoje o front-end usa apenas `style={{}}` inline, sem CSS framework nem sistema
de componentes — do ponto de vista de design é praticamente greenfield.

O resultado deve ser um dashboard coeso, quente e premium, com a mesma linguagem em
autenticação, navegação, tabelas, formulários e estados vazios.

## 2. Contexto e restrições

- **Stack atual:** Next.js 16 (App Router) + React 19, deploy na Vercel. Sem Tailwind,
  sem CSS, sem componentes.
- **A marca Cliconta é a marca do produto** (confirmado pelo utilizador) — replicamos
  fielmente, incluindo logo/wordmark.
- **Base técnica escolhida:** Tailwind CSS v4 (config CSS-first) + shadcn/ui (primitivas
  Radix copiadas para o repo, re-tematizadas via CSS variables).
- **Tema:** apenas claro nesta entrega; os tokens já ficam preparados para dark (não
  entregue).
- **Fonte de display:** *Forma DJR Display* é comercial e não pode ser empacotada sem
  licença. Enviamos **Hanken Grotesk** (Google Fonts, grotesca humanista quente, match
  próximo) via `next/font` e deixamos o slot `--font-display` para trocar pelo `.woff2`
  do Forma DJR quando disponível, sem tocar em componentes.
- **TDD (CLAUDE.md):** componentes são majoritariamente visuais; o foco de teste é
  **preservar e reforçar os e2e Playwright** existentes com seletores por role/label.
- **Preservar comportamento:** trocamos apenas a apresentação. Server Actions, rotas de
  API, `useActionState`, guards de sessão/papel e fluxo de dados ficam **intactos**.

## 3. Referência visual (DNA da Cliconta)

Extraído de https://www.cliconta.pt/:

- **Cor primária:** verde pinho/floresta profundo (`~#1E4A3B`).
- **Destaque (CTA):** amarelo manteiga/dourado suave (`~#EAC378`).
- **Neutros:** off-white/creme (`#FAFAF8`); verde-sálvia dessaturado para secundários.
- **Tipografia:** Forma DJR Display (Medium, tracking apertado) nos títulos; sans limpa
  no corpo.
- **Formas:** cantos muito arredondados (botões pill, cards de imagem), muito respiro.
- **Logo:** wordmark "Cliconta" + símbolo circular tipo "C" com uma onda/swoosh.
- **Motivo gráfico:** padrão de ondas/tils (`≈≈≈`) em sage; sensação orgânica e calma.

## 4. Tokens de design

Definidos como CSS variables no `globals.css`, expostos ao Tailwind v4 via `@theme`.
Valores de referência (ajustáveis na implementação com base em contraste/AA):

### 4.1 Cores

**Brand (verde pinho)** — escala 50→950:
`50 #EEF4F1` · `100 #D6E4DD` · `200 #AEC9BB` · `300 #7FA895` · `400 #4E8069`
`500 #2E6350` · `600 #1E4A3B` (primary) · `700 #1A4034` (sidebar) · `800 #14312A`
`900 #0F2620` · `950 #0A1A16`.

**Accent (amarelo manteiga):** `300 #F4DCA6` · `400 #EFCE88` · `500 #EAC378` (base) ·
`600 #DDB05A` · `700 #C4923A`. Foreground do accent = `brand-950`.

**Sage:** `300 #C3D3CA` · `400 #A9C0B4` · `500 #9DB5A8` (motivo de ondas, realces sutis).

**Neutros (quentes):** `background #FAFAF8` · `card #FFFFFF` · `muted #F2F1EC` ·
`muted-foreground #5B6B63` · `border/input #E6E4DD` · `foreground #16241E` ·
`ring = brand-600`.

**Semânticos** (texto/base + fundo suave):
- `success #2E7D5B` / bg `#E5F1EB`
- `warning #C88A2E` / bg `#FBF0DC`
- `destructive #B4472F` / bg `#F7E3DD`
- `info #2E6E7D` / bg `#DCEEF1`

### 4.2 Tipografia (Hanken Grotesk; display peso 500)

| Papel | Tamanho/linha | Peso | Tracking |
|---|---|---|---|
| display | 44 / 48 | 500 | -0.02em |
| h1 | 30 / 36 | 500 | -0.015em |
| h2 | 24 / 30 | 500 | -0.01em |
| h3 | 20 / 26 | 500 | normal |
| h4 | 16 / 22 | 600 | normal |
| body | 15 / 24 | 400 | normal |
| small | 13 / 18 | 400 | normal |
| caption | 12 / 16 | 500 | 0.02em |

Corpo e títulos usam Hanken Grotesk (`--font-sans`); `--font-display` aponta para o
mesmo por padrão, mas é o ponto único de troca para Forma DJR.

### 4.3 Raio, sombra, espaçamento

- **Raio:** `sm 8` · `md 12` (inputs) · `lg 16` · `xl 20` · `2xl 24` (cards) ·
  `full 9999` (botões, badges). Base shadcn `--radius = 12px`.
- **Sombras** (baixas, tom quente `rgba(20,49,42,·)`): `xs 0 1px 2px /.04` ·
  `sm 0 1px 3px /.06` · `md 0 4px 12px /.08` · `lg 0 12px 32px /.10`.
- **Espaçamento:** grid base 4px (padrão Tailwind). Container de conteúdo `max-w` ~1120px
  com paddings generosos.

## 5. Configuração técnica

### 5.1 Dependências novas (`apps/web`)

`tailwindcss@4`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `lucide-react`, `sonner`, e as primitivas `@radix-ui/*` que o shadcn
adicionar. `next/font` (já no Next) para Hanken Grotesk.

### 5.2 Estrutura de arquivos

```
apps/web/
  postcss.config.mjs               # { plugins: { "@tailwindcss/postcss": {} } }
  components.json                  # config shadcn (aliases @/components/ui, etc.)
  src/
    app/
      globals.css                  # @import tailwind + @theme (tokens) + base
      layout.tsx                   # importa globals.css, fontes (--font-sans/display), <html lang="pt">
      (auth)/layout.tsx            # layout minimal (sem shell) p/ login + change-password
      (auth)/login/...             # movido/ajustado p/ o grupo (auth) OU mantém rota, layout via grupo
      (dashboard)/layout.tsx       # AppShell + guard de sessão (fetch user 1x), passa user ao shell
    components/
      ui/                          # primitivas shadcn re-tematizadas
      brand/{logo,wave-motif}.tsx  # SVG do wordmark+símbolo e do padrão de ondas
      app-shell/{app-shell,sidebar,topbar}.tsx
      app-shell/nav-config.ts      # itens de navegação (label, href, ícone, role mínima)
      patterns/{page-header,status-badge,empty-state,data-table,form-field}.tsx
    lib/
      utils.ts                     # cn() = clsx + tailwind-merge
      labels.ts                    # (existente) rótulos PT dos enums — reutilizado
```

Observações:
- Tailwind v4 é **CSS-first**: tokens e tema vivem no `globals.css` via `@theme`; sem
  `tailwind.config.js` pesado (só o mínimo se necessário para content globbing do
  monorepo).
- Login e change-password passam a um grupo `(auth)` com layout próprio (sem shell). Se
  mover diretórios for arriscado para os e2e, alternativa: manter as rotas e dar o layout
  minimal por co-localização. A implementação escolhe o caminho de menor risco para os
  testes existentes.

## 6. Biblioteca de componentes

### 6.1 Primitivas (shadcn, re-tematizadas)

`Button` (variantes: `primary` [verde], `accent` [dourado], `outline`, `ghost`,
`destructive`; tamanhos `sm/md/lg/icon`; raio pill; suporte a ícone `lucide`),
`Input`, `Label`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Card` (Header/Content/
Footer), `Table`, `Badge`, `Dialog`, `DropdownMenu`, `Avatar`, `Alert`, `Sonner`
(toasts), `Skeleton`, `Separator`, `Tabs`.

### 6.2 Componentes de marca e padrões

- **`Logo`** — SVG inline recriando o wordmark "Cliconta" + símbolo circular. Props:
  `variant` (`onDark` branco / `onLight` verde), `size`.
- **`WaveMotif`** — SVG do padrão de ondas (sage), decorativo; usado no login e empty
  states. `aria-hidden`.
- **`AppShell`** — compõe Sidebar + Topbar + área de conteúdo.
- **`Sidebar`** — fundo `brand-700`, `Logo` (onDark) no topo, nav a partir de
  `nav-config`, estado ativo com indicador em `accent`, colapsável para ícones (desktop)
  e drawer (mobile).
- **`Topbar`** — barra clara com título da página (via `PageHeader`) + menu do
  utilizador (`Avatar` com iniciais, email, papel, "Sair" → `signOut`).
- **`PageHeader`** — título + subtítulo opcional + slot de ações (ex.: botão primário).
- **`StatusBadge`** — mapeia strings de status para `Badge` semântico (ver 6.3).
- **`EmptyState`** — ícone/`WaveMotif` + título + descrição + ação opcional.
- **`DataTable`** — wrapper de apresentação sobre `Table` (cabeçalho, hover, zebra
  opcional, densidade), recebendo colunas/linhas já resolvidas nas páginas server.
- **`FormField`** — Label + control + mensagem de erro/ajuda, para padronizar os
  formulários (usado por CompanyForm/TeamForm/CreateUserForm).

### 6.3 Mapeamento de status → cor

- **trace.status:** `success → success`; `error/failed → destructive`;
  `running → info`; `pending/queued → warning`; fallback → `muted`.
- **company.status:** `active → success`; `inactive → muted`; `suspended → warning`.
- **team.status:** `active → success`; `inactive → muted`.
- **role:** `admin → brand`; `operator → accent`; `viewer/leitor → muted`.

Rótulos vêm de `lib/labels.ts` (empresas/equipes) e `@toc/core/auth` (papéis).

## 7. App shell / navegação

Layout clássico de dashboard: **sidebar verde-pinho** à esquerda + **canvas off-white** +
**cards brancos** (contraste da Cliconta). Sidebar:

- Topo: `Logo` (branco).
- Nav (`nav-config`): **Traces**, **Empresas**, **Equipes**, **Usuários**. Itens de área
  restrita (Equipes/Usuários) aparecem para todos mas as páginas mantêm o gate por papel
  e redirecionam (comportamento atual preservado).
- Item ativo destacado com barra/realce em `accent`.
- Colapsável para ícones (desktop); drawer com overlay (mobile).

O `signOut`, hoje repetido no header de cada página, migra para o menu do utilizador
(topbar/rodapé da sidebar). A `(dashboard)/layout.tsx` atual (top-nav simples) é
substituída pela AppShell e passa a fazer o fetch de sessão uma vez, redirecionando para
`/login` se ausente.

## 8. Reformulação por tela

Todas trocam **apenas apresentação**; dados e ações permanecem.

1. **login** (`/login`) — layout split: painel esquerdo `brand-700` com `Logo`,
   `WaveMotif` e tagline; à direita `Card` branco com o formulário (email, senha, botão
   primário pill). Erro "Credenciais inválidas" em `Alert` destructive. Sem shell.
2. **change-password** (`/change-password`) — `Card` centrado, mesma linguagem de auth.
3. **traces** (`/traces`) — `PageHeader` "Traces"; `DataTable` (Gatilho · Status · Início)
   com `StatusBadge` e datas formatadas (`Intl.DateTimeFormat` pt-PT); `EmptyState` com
   ondas quando vazio.
4. **empresas** (`/empresas`, PR #3) — `PageHeader` "Empresas" + botão primário; a lista
   vira `DataTable` (Nome · NISS · NIF · Tipo · Status · Ação) com `StatusBadge` para
   tipo/status; o `CompanyForm` (13 campos) é reestilizado como `Card` seccionado em
   **grid 2 colunas** (grupos: Identificação fiscal · Contacto · Morada · Notas), erros
   como helper text via `FormField`. Edição em `/empresas/[id]` usa o mesmo componente.
   Seleção de equipe (admin) via `Select`.
5. **equipes** (`/equipes`, PR #3, admin) — `PageHeader` "Equipes"; como o `TeamForm` é
   curto (3 campos), o "Cadastrar" migra para um botão **"Nova equipe"** que abre um
   `Dialog`; lista vira `DataTable` (Nome · NIF · Status · Ação) com `StatusBadge`.
   Edição em `/equipes/[id]` reutiliza o form.
6. **admin/users** (`/admin/users`) — `PageHeader` "Usuários" + botão que abre `Dialog`
   com o `CreateUserForm`; `DataTable` com `Badge` de papel, `Badge` de equipe e de
   "1º acesso pendente". A atribuição de equipe (Select) do PR #3 é preservada.

## 9. Testes

- **Não** introduzir Storybook (não escolhido).
- **Preservar/atualizar** os e2e Playwright existentes: `apps/web/e2e/*` (login, traces,
  `companies.spec.ts`, `teams.spec.ts`, `api.spec.ts`, gate de admin). Atualizar seletores
  para `getByRole`/`getByLabel`/`getByText` de modo resiliente ao redesign; a11y vem das
  primitivas Radix.
- **Verificação final obrigatória:** `pnpm typecheck`, `pnpm lint` e os e2e verdes antes
  de concluir. Executar `graphify update .` após as mudanças de código.

## 10. Acessibilidade

- Contraste AA em texto sobre verde/creme/dourado (ajustar tokens se algum par falhar).
- Componentes interativos via Radix (foco, teclado, ARIA). `WaveMotif`/decorativos
  `aria-hidden`. Labels associadas a inputs. `ring` visível no foco.

## 11. Fora de escopo (YAGNI)

Dark mode (tokens prontos, não entregue), Storybook, i18n framework (strings PT inline
como hoje), gráficos/analytics, rearquitetura de server actions/rotas, novas
funcionalidades de produto além do redesenho.

## 12. Riscos e mitigação

- **Tailwind v4 + Next 16 + shadcn:** combinação suportada; validar PostCSS e globbing do
  monorepo. Mitigação: configurar e rodar `pnpm build`/`typecheck` cedo.
- **Mover login/change-password para grupo `(auth)`** pode quebrar rotas/e2e. Mitigação:
  preferir o caminho que não altera URLs; se preciso, ajustar specs no mesmo passo.
- **Substituição de fonte** pode divergir do Forma DJR real. Mitigação: slot
  `--font-display` isolado, troca trivial depois.
- **Formulário de empresa longo** — garantir usabilidade no grid 2 colunas e no mobile
  (colapsa para 1 coluna).
