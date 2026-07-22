# Cliconta Design System + Reformulação do Front-end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar um design system inspirado na Cliconta (tokens + componentes shadcn re-tematizados) e reformular todas as telas do `apps/web`, incluindo Empresas e Equipes (PR #3), trocando só a apresentação.

**Architecture:** Tailwind v4 (CSS-first, tokens via `@theme` no `globals.css`) + shadcn/ui hand-written (primitivas Radix onde há ganho real de a11y — Dialog e DropdownMenu; `<select>` nativo estilizado no resto). App shell com sidebar verde-pinho + canvas creme. Server Actions, rotas e guards permanecem intactos; muda apenas a UI.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · class-variance-authority · clsx · tailwind-merge · lucide-react · @radix-ui/react-dialog · @radix-ui/react-dropdown-menu · Hanken Grotesk (`next/font`).

## Global Constraints

- **Não alterar** Server Actions, rotas de API, `useActionState`, guards de sessão/papel nem nomes de campos de formulário (`name="..."`). Só apresentação.
- **Tema:** apenas claro. Tokens escritos em `:root`, estruturados para permitir dark depois (não entregar dark).
- **Fonte de display:** Hanken Grotesk via `next/font`; `--font-display` é o ponto único de troca para Forma DJR. Títulos peso 500.
- **TypeScript strict**; imports com alias `@/` dentro de `apps/web`.
- **Preservar e2e** (`apps/web/e2e/*`): usar seletores por role/label. `pnpm typecheck`, `pnpm lint` e e2e verdes ao final. Rodar `graphify update .` no fim.
- **Commits:** Conventional Commits, um por task.
- **Paleta (hex de referência):** brand-600 `#1E4A3B`, brand-700 `#1A4034`, accent-500 `#EAC378`, background `#FAFAF8`, card `#FFFFFF`, muted `#F2F1EC`, border `#E6E4DD`, foreground `#16241E`, muted-foreground `#5B6B63`. Semânticos: success `#2E7D5B`, warning `#C88A2E`, destructive `#B4472F`, info `#2E6E7D`.

---

## File Structure

```
apps/web/
  postcss.config.mjs                        # (novo) @tailwindcss/postcss
  components.json                           # (novo) marcador de convenção shadcn
  package.json                              # (mod) deps novas
  src/
    app/
      globals.css                           # (novo) tailwind + @theme + base
      layout.tsx                            # (mod) importa css + fontes
      (auth)/layout.tsx                     # (novo) layout minimal sem shell
      login/page.tsx                        # (mod) redesign
      change-password/page.tsx              # (mod) redesign
      (dashboard)/layout.tsx                # (mod) AppShell + guard
      (dashboard)/traces/page.tsx           # (mod) redesign
      (dashboard)/empresas/page.tsx         # (mod) redesign
      (dashboard)/empresas/CompanyForm.tsx  # (mod) redesign
      (dashboard)/empresas/[id]/page.tsx    # (mod) redesign
      (dashboard)/equipes/page.tsx          # (mod) redesign
      (dashboard)/equipes/TeamForm.tsx      # (mod) redesign
      (dashboard)/equipes/[id]/page.tsx     # (mod) redesign
      (dashboard)/admin/users/page.tsx      # (mod) redesign
      (dashboard)/admin/users/CreateUserForm.tsx # (mod) redesign
    lib/utils.ts                            # (novo) cn()
    components/
      ui/{button,badge,card,input,textarea,label,alert,skeleton,separator,avatar,select,dialog,dropdown-menu}.tsx
      brand/{logo,wave-motif}.tsx
      patterns/{page-header,status-badge,empty-state,data-table,form-field}.tsx
      app-shell/{app-shell,sidebar,topbar,user-menu}.tsx
      app-shell/nav-config.ts
```

---

## Task 1: Fundação — Tailwind v4, tokens, fontes, `cn`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/components.json`

**Produces:** classes Tailwind funcionais; CSS vars de token (`--color-brand-600`, etc.); `--font-sans`/`--font-display`; helper `cn`.

- [ ] **Step 1: Instalar dependências**

```bash
cd "apps/web" && pnpm add class-variance-authority clsx tailwind-merge lucide-react @radix-ui/react-dialog @radix-ui/react-dropdown-menu && pnpm add -D tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: `postcss.config.mjs`**

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

- [ ] **Step 3: `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: `src/app/globals.css`** — Tailwind + tokens no `@theme` + base. Definir a paleta completa (brand 50→950, accent 300→700, sage, neutros, semânticos com `-fg`/`-bg`), raios, sombras, e mapear para tokens semânticos do shadcn (`--color-background`, `--color-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-accent`, `--color-card`, `--color-muted`, `--color-border`, `--color-input`, `--color-ring`, `--radius`). Base: `body { @apply bg-background text-foreground font-sans antialiased; }`, foco visível, `font-display` para h1–h4. (Código completo escrito na implementação — ver §4 da spec para valores.)

- [ ] **Step 5: `src/app/layout.tsx`** — importar `./globals.css`, carregar Hanken Grotesk via `next/font/google` expondo `--font-sans` e `--font-display`, aplicar as vars no `<html>`.

```tsx
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Hanken_Grotesk } from "next/font/google";

const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Hanken_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Cliconta",
  description: "Dashboard de automação de guias fiscais",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: `components.json`** (convenção shadcn/aliases)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tailwind": { "css": "src/app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "ui": "@/components/ui", "lib": "@/lib", "utils": "@/lib/utils" },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 7: Verificar build/typecheck**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: build conclui sem erro (Tailwind detectado, CSS gerado).

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml pnpm-lock.yaml apps/web/postcss.config.mjs apps/web/components.json apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/lib/utils.ts
git commit -m "feat(web): fundação do design system (Tailwind v4 + tokens Cliconta + fontes)"
```

---

## Task 2: Primitivas base (sem Radix)

**Files:**
- Create: `src/components/ui/{button,badge,card,input,textarea,label,alert,skeleton,separator,avatar}.tsx`

**Interfaces / Produces:**
- `Button` + `buttonVariants({variant,size})`. Variants: `primary` (bg brand-600, text branco), `accent` (bg accent-500, text brand-950), `outline`, `ghost`, `destructive`. Sizes: `sm,md,lg,icon`. Raio `rounded-full`. Sem `asChild` (para não depender de Slot); para links use `className={buttonVariants({variant})}` num `<Link>`.
- `Badge` + `badgeVariants({tone})`: `neutral,success,warning,destructive,info,brand,accent`. Raio full, texto pequeno.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Input`, `Textarea`, `Label` (estilizados, `rounded-lg`, `border-input`, foco com `ring`).
- `Alert` (variantes `default`/`success`/`destructive`), `Skeleton`, `Separator`, `Avatar` (iniciais).

- [ ] **Step 1:** Escrever `button.tsx` com `cva` (variants acima) exportando `Button` e `buttonVariants`.
- [ ] **Step 2:** Escrever `badge.tsx` com `cva` e mapa de tons semânticos (usar tokens `-bg`/`-fg`).
- [ ] **Step 3:** Escrever `card.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `alert.tsx`, `skeleton.tsx`, `separator.tsx`, `avatar.tsx` (padrão shadcn, classes com tokens).
- [ ] **Step 4: Verificar**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui
git commit -m "feat(web): primitivas base do design system (button, badge, card, input, etc.)"
```

---

## Task 3: Overlays (Radix) + Select estilizado

**Files:**
- Create: `src/components/ui/dialog.tsx` (Radix Dialog)
- Create: `src/components/ui/dropdown-menu.tsx` (Radix DropdownMenu)
- Create: `src/components/ui/select.tsx` (`<select>` nativo estilizado + `<option>` reexportado)

**Produces:** `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose`; `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel`; `Select` (native, `name`/`defaultValue` passthrough para funcionar com FormData) + `SelectField` wrapper com chevron.

- [ ] **Step 1:** `dialog.tsx` com Radix (overlay com blur suave, content `rounded-2xl`, animações de open/close).
- [ ] **Step 2:** `dropdown-menu.tsx` com Radix (content `rounded-xl`, sombra `md`).
- [ ] **Step 3:** `select.tsx`: componente `Select` que renderiza `<select>` nativo com classes (mesma altura/borda do Input) e um ícone chevron; aceita `name`, `defaultValue`, `required`, `children` (`<option>`). Mantém compatibilidade com os forms atuais.
- [ ] **Step 4: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 5: Commit** `git add apps/web/src/components/ui && git commit -m "feat(web): overlays (Dialog, DropdownMenu) e Select estilizado"`

---

## Task 4: Componentes de marca (Logo, WaveMotif)

**Files:**
- Create: `src/components/brand/logo.tsx`
- Create: `src/components/brand/wave-motif.tsx`

**Produces:** `Logo({ variant?: "onDark" | "onLight"; className? })` — SVG inline com símbolo circular (arco em "C" + swoosh/onda) + wordmark "Cliconta"; `currentColor` para adaptar por variante. `WaveMotif({ className? })` — grade de tils/ondas em `sage`, `aria-hidden`.

- [ ] **Step 1:** Escrever `logo.tsx` recriando o símbolo (círculo/arco + onda) e o wordmark; usar `currentColor`; `onDark` = branco, `onLight` = brand-700.
- [ ] **Step 2:** Escrever `wave-motif.tsx` (SVG repetível, sage, decorativo).
- [ ] **Step 3: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 4: Commit** `git add apps/web/src/components/brand && git commit -m "feat(web): logo Cliconta (SVG) e motivo de ondas"`

---

## Task 5: Componentes de padrão

**Files:**
- Create: `src/components/patterns/{page-header,status-badge,empty-state,data-table,form-field}.tsx`

**Produces:**
- `PageHeader({ title, description?, actions? })`.
- `StatusBadge({ kind: "trace" | "company" | "team" | "role"; value: string })` — usa o mapa de §6.3 da spec e `Badge`; rótulo via `lib/labels.ts`/`@toc/core/auth` quando aplicável.
- `EmptyState({ title, description?, icon?, action? })` com `WaveMotif` de fundo.
- `DataTable` — wrapper de apresentação sobre `ui` table primitives (cabeçalho, hover, densidade); API simples recebendo `head` e `children` (linhas), para as páginas server montarem.
- `FormField({ label, htmlFor, error?, hint?, children })`.

- [ ] **Step 1:** `status-badge.tsx` com os mapas de tom por `kind`/`value` (trace: success→success, error/failed→destructive, running→info, pending/queued→warning; company: active→success, inactive→muted, suspended→warning; team: active→success, inactive→muted; role: admin→brand, operator→accent, viewer→muted).
- [ ] **Step 2:** `page-header.tsx`, `empty-state.tsx`, `data-table.tsx`, `form-field.tsx`.
- [ ] **Step 3: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 4: Commit** `git add apps/web/src/components/patterns && git commit -m "feat(web): componentes de padrão (PageHeader, StatusBadge, EmptyState, DataTable, FormField)"`

---

## Task 6: App shell + layout do dashboard

**Files:**
- Create: `src/components/app-shell/nav-config.ts`
- Create: `src/components/app-shell/{sidebar,topbar,user-menu,app-shell}.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `getSessionUser` de `@/lib/auth`; `signOut` de `@/app/login/actions`; `Logo`, `DropdownMenu*`, `Avatar`, `buttonVariants`.
- `nav-config.ts` produz `NAV_ITEMS: { label, href, icon }[]` (Traces, Empresas, Equipes, Usuários) — todos visíveis (páginas fazem o gate, comportamento atual).
- `AppShell({ user, children })` — user: `{ email, role, teamId }`.

- [ ] **Step 1:** `nav-config.ts` com os 4 itens + ícones lucide.
- [ ] **Step 2:** `sidebar.tsx` (client) — fundo `brand-700`, `Logo onDark`, nav com item ativo (via `usePathname`) destacado em `accent`; responsivo (colapsa em drawer no mobile com botão no topbar).
- [ ] **Step 3:** `user-menu.tsx` (client) — `Avatar` (iniciais do email), nome/email/papel, `DropdownMenu` com form `signOut` ("Sair").
- [ ] **Step 4:** `topbar.tsx` — barra clara; slot para título (as páginas usam `PageHeader`, então o topbar traz botão do drawer no mobile + `UserMenu`).
- [ ] **Step 5:** `app-shell.tsx` — grid sidebar + (topbar + `main` com container e canvas `bg-background`).
- [ ] **Step 6:** `(dashboard)/layout.tsx` — server component: `const user = await getSessionUser(); if (!user) redirect("/login");` e retorna `<AppShell user={user}>{children}</AppShell>`.
- [ ] **Step 7: Verificar** `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
- [ ] **Step 8: Commit** `git add apps/web/src/components/app-shell "apps/web/src/app/(dashboard)/layout.tsx" && git commit -m "feat(web): app shell Cliconta (sidebar verde-pinho, topbar, user menu)"`

---

## Task 7: Autenticação (login + change-password)

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/change-password/page.tsx`

Nota: **não mover** as rotas `login`/`change-password` (mantém URLs e e2e). O `(auth)/layout.tsx` só é aplicado se as páginas forem movidas para o grupo; como não movemos, o layout de auth é aplicado localmente nas próprias páginas (wrapper `AuthShell` interno) OU cria-se o grupo movendo os diretórios. **Escolha de menor risco:** manter URLs; encapsular o visual num componente `AuthLayout` importado pelas duas páginas (sem `(auth)/layout.tsx`). Ajustar o plano na execução conforme os e2e.

- [ ] **Step 1:** Criar `AuthLayout` (split: painel `brand-700` com `Logo onDark` + `WaveMotif` + tagline; à direita `Card` com `children`).
- [ ] **Step 2:** `login/page.tsx` — usar `AuthLayout`, `Card`, `Input`/`Label`, `Button` primary pill; erro em `Alert` destructive ("Credenciais inválidas."). Preservar `action={signIn}`, `name="email"`, `name="password"`.
- [ ] **Step 3:** `change-password/page.tsx` — `AuthLayout` centrado + `Card` + form (preservar action e `name`s existentes; ler o arquivo atual antes de editar).
- [ ] **Step 4: Verificar** login e2e:

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS. (e2e completos no Task 12.)

- [ ] **Step 5: Commit** `git add apps/web/src/app/login apps/web/src/app/change-password apps/web/src/components && git commit -m "feat(web): redesign de login e troca de senha (auth Cliconta)"`

---

## Task 8: Traces

**Files:**
- Modify: `src/app/(dashboard)/traces/page.tsx`

- [ ] **Step 1:** Substituir o `<main>`/`<header>`/`<table>` inline por `PageHeader` "Traces" + `DataTable` (Gatilho · Status · Início) com `StatusBadge kind="trace"`; formatar `started_at` com `Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" })`; `EmptyState` quando `traces.length === 0`. **Remover** o form de `signOut` do header (agora no shell). Preservar a query Supabase e `dynamic`.
- [ ] **Step 2: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 3: Commit** `git add "apps/web/src/app/(dashboard)/traces/page.tsx" && git commit -m "feat(web): redesign da página de traces"`

---

## Task 9: Empresas (lista + form + edição)

**Files:**
- Modify: `src/app/(dashboard)/empresas/page.tsx`
- Modify: `src/app/(dashboard)/empresas/CompanyForm.tsx`
- Modify: `src/app/(dashboard)/empresas/[id]/page.tsx`

- [ ] **Step 1:** `CompanyForm.tsx` — manter `useActionState`, `action`, todos os `name="..."` e a lógica (`isAdmin`, `teams`, `defaultTeamId`, `initial`). Trocar markup por `Card` com **grid 2 colunas** agrupado (Identificação fiscal: Equipe/NISS/NIF/Nome/Tipo/Status · Contacto: Email/Telefone · Morada: linhas/CP/Cidade/País · Notas full-width), usando `FormField` + `Input`/`Select`/`Textarea`; erros via `fieldErrors`; `Alert` para `state.error`/`state.ok`; `Button` primary com estado `pending`. Colapsar para 1 coluna no mobile.
- [ ] **Step 2:** `empresas/page.tsx` — `PageHeader` "Empresas"; manter fetch (`listCompanies`, `listTeams` p/ admin); `CompanyForm` dentro de um `Card`/seção; lista → `DataTable` (Nome · NISS · NIF · Tipo · Status · Ação) com `StatusBadge kind="company"` no status e `Badge`/label no tipo; `Link` "Editar" como `buttonVariants({variant:"ghost", size:"sm"})`; `EmptyState` quando vazio. Remover `signOut` do header.
- [ ] **Step 3:** `empresas/[id]/page.tsx` — ler o arquivo atual; aplicar `PageHeader` "Editar empresa" + reusar `CompanyForm` já reestilizado. Preservar guards/fetch.
- [ ] **Step 4: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 5: Commit** `git add "apps/web/src/app/(dashboard)/empresas" && git commit -m "feat(web): redesign de Empresas (lista, form seccionado, edição)"`

---

## Task 10: Equipes (lista + form em Dialog + edição)

**Files:**
- Modify: `src/app/(dashboard)/equipes/page.tsx`
- Modify: `src/app/(dashboard)/equipes/TeamForm.tsx`
- Modify: `src/app/(dashboard)/equipes/[id]/page.tsx`

- [ ] **Step 1:** `TeamForm.tsx` — manter `useActionState`/`action`/`name`s; markup com `FormField` + `Input`/`Select`; `Alert` de erro/sucesso; `Button` com `pending`. Deve funcionar tanto solto (página de edição) quanto dentro de um `Dialog`.
- [ ] **Step 2:** `equipes/page.tsx` — `PageHeader` "Equipes" com ação `Dialog` "Nova equipe" (client wrapper que abre o `Dialog` contendo `TeamForm` de criação); lista → `DataTable` (Nome · NIF · Status · Ação) com `StatusBadge kind="team"`; `Link` "Editar" estilizado; `EmptyState`. Preservar `requireRole("admin")`/redirect e fetch. Remover `signOut` do header.
- [ ] **Step 3:** `equipes/[id]/page.tsx` — ler atual; `PageHeader` "Editar equipe" + `TeamForm`.
- [ ] **Step 4: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 5: Commit** `git add "apps/web/src/app/(dashboard)/equipes" && git commit -m "feat(web): redesign de Equipes (lista, Dialog de criação, edição)"`

---

## Task 11: Admin / Usuários

**Files:**
- Modify: `src/app/(dashboard)/admin/users/page.tsx`
- Modify: `src/app/(dashboard)/admin/users/CreateUserForm.tsx`

- [ ] **Step 1:** Ler ambos os arquivos atuais (o PR #3 adicionou atribuição de equipe). `CreateUserForm.tsx` — preservar action/`name`s (incl. seleção de equipe); markup com `FormField`/`Input`/`Select`/`Button`; `Alert`. Preparar para abrir em `Dialog`.
- [ ] **Step 2:** `admin/users/page.tsx` — `PageHeader` "Usuários" + `Dialog` "Novo utilizador" com `CreateUserForm`; `DataTable` (Email · Nome · Papel · Equipe · 1º acesso) com `StatusBadge kind="role"` no papel, `Badge` de equipe e badge de "1º acesso pendente". Preservar `requireRole("admin")`/redirect, fetch e `dbRoleToUiLabel`. Remover `signOut` do header.
- [ ] **Step 3: Verificar** `pnpm --filter web typecheck` → PASS.
- [ ] **Step 4: Commit** `git add "apps/web/src/app/(dashboard)/admin" && git commit -m "feat(web): redesign de Usuários (Dialog de criação, badges)"`

---

## Task 12: Verificação final

**Files:** nenhum novo (ajustes de seletor em `apps/web/e2e/*` se necessário).

- [ ] **Step 1:** Ler os specs em `apps/web/e2e/*` e ajustar seletores frágeis para `getByRole`/`getByLabel`/`getByText`, refletindo os novos markups (sem mudar asserts de comportamento).
- [ ] **Step 2: Typecheck + Lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 3: e2e** (exige Supabase local; ver CLAUDE.md)

Run: `pnpm --filter web test` (ou o comando e2e do repo)
Expected: verdes. Se o ambiente não tiver Supabase, registrar que os e2e precisam rodar com `pnpm db:start` e documentar o resultado honestamente.

- [ ] **Step 4: Atualizar grafo**

Run: `graphify update .`

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e graphify-out
git commit -m "test(web): ajusta seletores dos e2e ao novo design + atualiza grafo"
```

---

## Self-Review (cobertura da spec)

- Tokens/paleta/tipografia/raio/sombra → Task 1. ✓
- Biblioteca de componentes (primitivas + overlays + select) → Tasks 2–3. ✓
- Marca (Logo, WaveMotif) → Task 4. ✓
- Padrões (PageHeader, StatusBadge, EmptyState, DataTable, FormField) → Task 5. ✓
- App shell + nav + `(dashboard)/layout` → Task 6. ✓
- Login/change-password → Task 7. ✓
- Traces → Task 8; Empresas → Task 9; Equipes → Task 10; Admin/Users → Task 11. ✓
- Preservação de server actions/rotas → constraint global + notas por task. ✓
- Testes/typecheck/lint/graphify → Task 12. ✓
- Fora de escopo (dark, storybook, i18n, novas features) → respeitado (nenhuma task os inclui). ✓
