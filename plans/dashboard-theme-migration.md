# Plan: Dashboard theme migration to Parchment & Clay + shadcn/ui adoption

## Context

A new design system landed in `dashboard/design-system/` (`theme.css` + `THEME.md`). It defines a warm "Parchment & Clay v1" palette with full semantic tokens intentionally shaped to be **shadcn/ui-compatible** (`background`, `foreground`, `card`, `primary`, `muted`, `accent`, `destructive`, `border`, `ring`, `success`/`notice`/`info`/`attention`, `chart-1..8`, sidebar tokens, warm shadows, serif for editorial moments).

Today's dashboard was built against a different system:
- **Old theme** (`dashboard/src/app/globals.css:43-87`): dark-only, indigo accent, `--color-void` / `--color-surface-0..3` / `--color-text-primary|secondary|tertiary` / `--color-accent` (`#6366F1`). No semantic tokens, no light mode, no dark mode *override* layer — dark is just baked in.
- **No component library**: zero Radix, no `clsx`/`cva`/`tailwind-merge`, no `lucide-react`. Every button, dropdown, skeleton is hand-rolled. `OrgSwitcher` (`dashboard/src/components/org-switcher.tsx`) implements click-outside detection by hand.
- **Tailwind v4** already in place (`@tailwindcss/postcss` ^4.2.2) — no v3→v4 migration needed.
- **Hard-coded hex values** leak into JSX: `NextTopLoader` color `#6366F1` in root layout, `MetricBarChart` tooltip `#1F1F2E` / axis `#56566A` (`dashboard/src/components/metric-bar-chart.tsx:90-114`).

The old palette and the new palette disagree on almost every token name. A find-replace is not viable — components need to be rewritten against semantic tokens.

At the same time, the user has asked to adopt [shadcn/ui](https://ui.shadcn.com/) rather than continue hand-building primitives. The new theme was designed for this — its token names match shadcn's out of the box.

## Goals

1. **Every pixel of `dashboard/src/app/**` renders through the Parchment & Clay tokens.** No `dark:` variants referencing the old palette, no hex codes in JSX, no `--color-surface-0` references left.
2. **Primitive UI comes from shadcn/ui**, composed in app components. No hand-rolled Button/Dialog/DropdownMenu/Select/Tabs/Tooltip/Sheet/Popover/Skeleton etc. by the end of the migration.
3. **Light mode is the default**; dark mode is reachable via a persistent user toggle (via `next-themes`, which respects system preference on first visit).
4. **The wiki, CLAUDE.md, and ADRs reflect the new direction** — so every future contributor (human or agent) defaults to the right tokens and the right component library without being told.
5. **No regressions in streaming/Suspense, server-component boundaries, or data fetching** — the migration is skin-deep where possible.

## Non-goals

- Redesigning information architecture or page layouts. Same routes, same content, same data. This is a re-skin + component-library swap, not a product redesign.
- Migrating any Rails server, Go CLI, or `docs/` rendering logic. (The `/docs` and `/docs/[slug]` routes will pick up the new theme, but the underlying markdown-to-HTML plumbing is unchanged.)
- Adding new features, metrics, or dashboard pages during migration. Any feature work discovered mid-migration gets filed and done separately.
- Deleting `dashboard/design-system/`. The `design-system/` directory stays as source-of-truth docs (`THEME.md`) even after `theme.css` is wired into the app.

## Decisions

Decisions captured upfront from discussion — these shape the sequencing below:

| Decision | Choice |
|---|---|
| Default mode | **Light**, with `next-themes` toggle. Dark mode fully supported from day one. |
| Scope | **All of `dashboard/src/app/`** — authenticated app, marketing, auth, invite, settings. One coherent visual language across the Next.js app. |
| Sequencing | **Foundation first, then route-by-route.** Each post-foundation PR is small and independently reviewable. Old and new styles may briefly coexist during rollout. |
| Fonts | **Drop Geist.** Rely on the theme's defaults: system-sans + Inter for body, Iowan Old Style / Source Serif 4 / Charter for display (all listed in `theme.css` stack). No webfont loads. Serif used sparingly per `THEME.md §4`. |

---

## Phase 0 — Foundation (one PR, no route changes)

The goal of Phase 0 is that on branch merge, **the app looks identical to what it looks like today**, but underneath:
- The new theme is loaded.
- shadcn/ui is installed and ready to use.
- Docs have been updated so every subsequent PR is done correctly.

### 0.1 Relocate `theme.css` and merge into app styles

`dashboard/design-system/` is an awkward location for a stylesheet the app consumes at build time. Collapse it:

- **Move the CSS:** replace `dashboard/src/app/globals.css` contents with the contents of `dashboard/design-system/theme.css`. (Single file, no extra import indirection, same import path that `layout.tsx` already uses.)
- **Move the docs:** move `dashboard/design-system/THEME.md` → `dashboard/THEME.md` (one level up, sits next to `package.json` where a developer would look for it). Update its internal references: the `[`theme.css`](./theme.css)` link and the file-map section (§8) point at `src/app/globals.css` now; the "Update `THEME.md` and `theme.css` together" rule in §7 just says "update `THEME.md` and `globals.css` together".
- **Delete `dashboard/design-system/`** once both files are moved.
- Strip the old `@theme { ... }` block, `.metric-card` / `.tooltip-*` / `.animate-in` rules, and Geist `@font-face` imports out of `globals.css` at the same time (they were in the file before the theme.css replacement — don't let any leak through). Any base-layer overrides the dashboard genuinely needs (TopLoader color, custom scrollbar) stay in `globals.css`, appended after the `@layer base { ... }` block from the theme.
- Update all references to the old paths elsewhere in the repo: grep for `design-system/theme.css` and `design-system/THEME.md`; fix any matches (CLAUDE.md, wiki, ADRs all get updated in 0.6 anyway, so this is mostly a sanity check).
- Expectation: after this step only, the app will look visually broken (light terracotta palette but old layout code expects dark indigo surfaces). That's fine — Phase 0 continues.

### 0.2 Install shadcn/ui

- Install required peer deps: `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `next-themes`. (Radix deps come in with each shadcn component as it's added.)
- Run `npx shadcn@latest init`, answering:
  - Style: `new-york` (cleaner, pairs better with serif for display)
  - Base color: doesn't matter — we ignore its generated CSS and keep ours. Confirm the generated `components.json` points to `src/app/globals.css`.
  - RSC: yes
  - Tailwind config: v4 (CSS-first; `components.json` should reference `globals.css`, not a JS config)
  - `cn` helper path: `src/lib/utils.ts`
- Verify `components.json` ends up with `tailwind.css` → `src/app/globals.css` and aliases pointing at `src/components/ui/` and `src/lib/`.
- **Lazy install** — do not bulk-install primitives upfront. Each later phase runs `npx shadcn@latest add <primitive>` as it needs them. Only primitives installed in Phase 0 are what's needed to verify the wiring:
  - `button` (for the sanity-check)
  - `dropdown-menu` (for the theme toggle in 0.4)
- Sanity-check: render a single shadcn Button on a throwaway `/dev-theme` preview route to confirm the token wiring — primary button should be terracotta, not default slate. Remove this route before Phase 0 lands.

### 0.3 Replace the Geist loader

- Delete the `@font-face` Geist imports from `globals.css` and the Geist link tags in `dashboard/src/app/layout.tsx`.
- Rely on the theme's existing `--font-sans` / `--font-serif` / `--font-mono` stacks (system-first + Inter + Iowan Old Style). No `next/font` loads.
- Verify the body renders with a reasonable system-sans on macOS, Linux, Windows before touching anything else.

### 0.4 `next-themes` theme toggle

- Wrap the root layout body with a `<ThemeProvider attribute="class" defaultTheme="light" enableSystem>` client component (`dashboard/src/components/theme-provider.tsx`).
- Add a `<ThemeToggle />` primitive (shadcn-style; uses `DropdownMenu` with Light / Dark / System options). Landing spot: top-right of the `(app)` sidebar/topbar and the `(marketing)` header. Actual placement finalized in Phase 1, but the component exists in Phase 0.
- Persistence: default `next-themes` behavior (localStorage) is fine. No cookie-sync needed yet — SSR hydration mismatch is avoided by `suppressHydrationWarning` on `<html>`.

### 0.5 Brand assets wiring

A separate `dashboard/brand-assets/` package landed alongside the theme — SVG wordmark + symbol, PNG rasters, Next.js app-convention metadata files, React components (`Mark`, `Wordmark`, `Logo`). They're foundation work like the theme itself: Phase 1 (app/marketing shells) needs the logo components immediately, and favicon / manifest / OG images are "set once, forget" infrastructure that shouldn't block on route migrations.

- **Copy React components** into `src/components/logo/` (`Mark.tsx`, `Wordmark.tsx`, `Logo.tsx`, `index.ts`). Components use `currentColor` for ink and `var(--ax-clay)` for the accent dot.
- **Copy Next.js app-convention files** (`icon.svg`, `icon.png`, `apple-icon.png`, `favicon.ico`, `opengraph-image.png`, `twitter-image.png`, `manifest.webmanifest`) into `src/app/`. Next.js's file-convention metadata API auto-picks these up — no explicit references needed in `layout.tsx`.
- **Copy PWA icons** (`ax-icon-192.png`, `ax-icon-512.png`, `ax-icon-maskable-192.png`, `ax-icon-maskable-512.png`) into `public/` so the manifest's absolute-path references resolve.
- **Add `--ax-clay` to `globals.css`** as an alias of `--color-primary` (light + dark inherit automatically). Brand README's recommended shortcut.
- **Update `layout.tsx` metadata:** add `title.template` (`"%s · AX"`), and a `viewport` export with `themeColor` for light (`#FAF5EC`) / dark (`#14110C`) — Next.js 14+ moved `themeColor` out of `metadata` onto `viewport`.
- **Slim `brand-assets/` to source-of-truth only.** After copying, delete `brand-assets/next-app/`, `brand-assets/react/`, `brand-assets/png/`, and `brand-assets/preview.html` — they're 1:1 duplicates of what's now installed in the app and would drift if ever edited. Keep `brand-assets/README.md` (brand contract: color, clear space, min sizes, don'ts) and `brand-assets/svg/` (8 authoritative vector sources). Update the README to point readers at the in-app paths for components, favicons, PWA icons, OG images, and manifest. The remaining directory is small, durable, and the only place to edit when brand geometry or color needs to change.

### 0.6 Recharts theming helper

- `MetricBarChart` hard-codes four hex values. Don't migrate it yet, but in Phase 0 add a tiny helper `src/lib/chart-theme.ts` that reads CSS variables at render:
  ```ts
  export const chartColor = (slot: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) =>
    `var(--color-chart-${slot})`;
  ```
  Phase 5 refactors `MetricBarChart` to use it. This is a no-op in Phase 0 except that it exists.

### 0.7 Documentation updates (Phase 0 MUST NOT merge without these)

These doc updates are load-bearing — they're what ensures every subsequent PR (and every future contributor) hits the new direction by default, not the old one.

1. **`CLAUDE.md` (project root)** — under "Documentation" / before the "Decisions" section, add a short UI section:
   > **Dashboard UI.** The dashboard uses Tailwind v4 with the "Parchment & Clay" theme defined in `dashboard/design-system/theme.css`. Usage rules live in `dashboard/design-system/THEME.md` — **read it before styling any dashboard UI**. Primitive UI (buttons, inputs, dialogs, etc.) comes from [shadcn/ui](https://ui.shadcn.com/); install new primitives with `npx shadcn@latest add <name>`. Compose shadcn primitives into app-specific components; never hand-roll a button or dropdown.
- Update the wiki table of contents entry for Dashboard to flag the new styling direction.

2. **`wiki/dashboard.md`** — the entire "Styling" section (lines 107–128) is stale:
   - Delete references to "Dark mode only", `--color-void`, `--color-surface-0..3`, `--color-text-primary|secondary|tertiary`, `--color-accent`, Geist fonts, `.metric-card` / `.animate-in` / `.tooltip-*`.
   - Replace with: a pointer to `design-system/THEME.md` as the canonical reference; a one-paragraph summary of semantic tokens; a note that components come from shadcn/ui (with the `npx shadcn@latest add` command); a note that dark mode is supported via `next-themes`.
   - Update the "Components" section (lines 69–82) to describe the shadcn-under-`src/components/ui/` + app-components-under-`src/components/` split.

3. **`wiki/conventions.md`** — lines 71–74: update to:
   - "Tailwind CSS v4 with the Parchment & Clay theme (`dashboard/design-system/theme.css`). See `design-system/THEME.md` for token usage. Light mode is the default; dark mode is user-toggleable via `next-themes`."
   - "Primitive UI (buttons, inputs, dialogs, dropdowns, etc.) comes from shadcn/ui under `src/components/ui/`. Application components under `src/components/` compose those primitives. Don't hand-roll primitives."
   - Keep the "No CSS modules" line.

4. **New ADR: `docs/decisions/015-design-system-and-shadcn.md`** — follow `docs/decisions/TEMPLATE.md`. Summary:
   - **Decision:** Adopt the Parchment & Clay theme as the dashboard's canonical design system, and adopt shadcn/ui as the primitive component library.
   - **Why:**
     - The warm, non-judgmental palette reinforces AX's "measure teams, not individuals" product ethos (see `project_product_ethos.md`) far better than the indigo-on-dark Linear-clone palette did.
     - shadcn/ui gives us Radix-level accessibility and a consistent primitive vocabulary without pulling in a full component library — we own the code.
     - The new theme's token names are already shadcn-compatible by construction, so there's no second migration.
   - **Relationship to ADR-006 (UX Philosophy):** ADR-006 remains valid on principles (inline metric context, restrained chrome, plain-language explanations, honest ambiguity). It is amended, not superseded: the **palette implementation** changes from "Linear-inspired, dark-mode-first, indigo accent" to "field-notebook, light-default-with-dark-toggle, terracotta hero". The ADR-006 principles still drive component decisions (e.g., no red/green status colors).
   - **Consequences:** All dashboard styling flows through semantic tokens. No new UI without shadcn primitives. Font stack shifts to system + Inter + Iowan Old Style (no Geist webfont load).
   - Add a pointer entry to this new ADR in `CLAUDE.md`'s Decisions list.

5. **Amend `docs/decisions/006-ux-philosophy.md`** — append a short "Amended by ADR-015" block at the top noting that the *palette and dark-first default* have changed while the *principles* remain authoritative.

6. **Update the memory index.** The user's auto-memory index at `/Users/austinroos/.claude/projects/-Users-austinroos-dev-ax/memory/MEMORY.md` contains `feedback_ux_philosophy.md` ("Dashboard must feel like Linear: sleek, dark mode first..."). That memory is now stale. Update it to reflect the new direction — "sleek + restrained + inline metric context" stays; "like Linear" and "dark mode first" flip to "like a field notebook, light-default-with-dark-toggle, warm palette".

7. **`wiki/log.md`** — add a single entry:
   ```
   ## 2026-04-16 — Parchment & Clay theme + shadcn/ui adoption (Phase 0 foundation)

   **Pages updated:** dashboard, conventions
   **Decisions added:** 015-design-system-and-shadcn; ADR-006 amended
   **What changed:** Wired dashboard/design-system/theme.css into globals.css; installed shadcn/ui and base primitives; added next-themes toggle (light default); dropped Geist webfont. Per-route migrations follow in subsequent PRs.
   ```

### 0.8 Phase 0 acceptance

- `just dashboard-build` passes, `just dashboard-dev` serves on :3333.
- Current pages render (they'll look off — unstyled buttons, wrong colors — that's expected; old tokens no longer resolve). No JS errors, no hydration mismatches.
- Dev `/dev-theme` preview route shows primitives rendering in terracotta in light mode, brightened clay in dark mode, with working toggle.
- Wiki/CLAUDE.md/ADR updates reviewed in the same PR.

---

## Phase 1 — App shell and marketing shell

Swap the two long-lived layouts before touching content routes — once the shells land, every page inside them gets free consistency.

- **`dashboard/src/app/(app)/layout.tsx`**: replace the hand-rolled 220px sidebar with shadcn `sidebar` component. Keep the same nav items (Home, PRs, Docs, Billing, Settings). Keep the async server-component pattern and Suspense boundaries. Replace the inline nav SVG icons with `lucide-react` (`Home`, `GitPullRequest`, `BookOpen`, `CreditCard`, `Settings`, etc.). Replace `OrgSwitcher` (`src/components/org-switcher.tsx`) with a shadcn `Command` + `Popover` combobox — drop the hand-rolled click-outside logic. Add the `ThemeToggle` to the sidebar footer.
- **`dashboard/src/app/(marketing)/layout.tsx`**: replace the sticky header with a composition of shadcn `NavigationMenu` + `Button`. Swap the sign-in / get-started buttons for shadcn `Button` (primary + outline variants). Footer becomes a plain composition of shadcn `Separator` + text, with the ThemeToggle at the right.
- Replace the root layout's `NextTopLoader` color (`#6366F1`) with `var(--color-primary)` via `color="hsl(var(--primary))"` or the ref equivalent.
- Delete `src/components/org-switcher.tsx` (or rewrite it as a thin wrapper around shadcn primitives).

**Docs touched in this PR:** append to `wiki/log.md`. `wiki/dashboard.md`'s "Components" section gets its sidebar description replaced.

## Phase 2 — Marketing & docs routes

`(marketing)/`: `/`, `/docs`, `/docs/[slug]`, `/docs/data-collection`, `/plans`, `/setup`, `/changelog`, `/terms`.

- Apply serif (`font-serif`) to top-level page titles and any pull-quote moments per `THEME.md §4`.
- `/docs/[slug]` — verify `react-markdown` output inherits body typography cleanly from the new theme. Audit `prose` usage; if we rely on `@tailwindcss/typography`, configure its CSS vars to our tokens. If we don't, style headings/links/code explicitly using tokens (`text-foreground`, `bg-muted`, `border-border`, link hover → `text-primary`).
- `/plans` (pricing) — rebuild plan cards with shadcn `Card` + `Badge`. Use `success`/`notice` tokens for plan feature pills, **not** primary (primary is reserved for the single CTA per card per `THEME.md §4`).
- `/changelog` — pure typography; verify the serif for entry dates.

## Phase 3 — Auth & invite routes

`/login`, `/auth/accept`, `/logout`, `/invite/[token]`, `/invite/error`.

- Tight scope — mostly cards with a single primary button. Rebuild each with shadcn `Card` + `Button` + `Input` + `Label`. Error page uses `attention` token (russet) pill, not destructive background.

## Phase 4 — Authenticated app routes

`(app)/[slug]/`, `(app)/[slug]/metrics/[metric]`, `(app)/[slug]/prs`, `(app)/[slug]/settings`, `(app)/[slug]/billing`, `/onboarding`, `/settings`, `/prs/[id]`.

Subphases, each a separate PR:

- **4a. KPI cards & overview (`[slug]/page.tsx`)** — `BooleanMetricSummary` and any metric summary tiles rebuilt on shadcn `Card`. Status pills (merged, open, closed) use `success` / `info` / `attention` tokens — **not** primary, per `THEME.md §4` ("Don't use primary as a status indicator").
- **4b. Metric detail (`metrics/[metric]/page.tsx`)** — charts, tables, inline explanations. Ensure the inline-metric-context ethos from ADR-006 survives: explanatory copy uses `muted-foreground`, metric values use `foreground` (never `primary` — ADR-006's "user decides what's good").
- **4c. PRs list + detail (`prs/`, `/prs/[id]`)** — shadcn `Table` for list; PR link uses `primary` (the rare sanctioned use — `THEME.md §3` lists "PR links" as a brand-forward moment). Status pills (merged / open / closed / draft) use the status palette.
- **4d. Settings + billing + onboarding** — forms: shadcn `Form` (react-hook-form + zod) or inline with `Input`/`Label`/`Button` depending on complexity. Billing uses `Card` for plan tiles. Onboarding is a stepper — shadcn doesn't ship one; compose from `Progress` + `Card`.
- **4e. Skeletons** — replace `src/components/skeleton.tsx` (`metric-skeleton`, `chart-skeleton`, `table-skeleton`, `page-skeleton`) with compositions of shadcn `Skeleton`. Keep the same named variants so loading.tsx files don't need to change.

## Phase 5 — Charts

`MetricBarChart` is the only chart component today, and it hard-codes hex.

- Rebuild using the shadcn `chart` primitive (it wraps recharts, provides themed tooltips and legends that respect our tokens).
- Swap hard-coded `#1F1F2E` / `#252536` / `#E8E8ED` / `#56566A` / `rgba(255,255,255,0.03)` for `var(--color-card)`, `var(--color-border)`, `var(--color-card-foreground)`, `var(--color-muted-foreground)`, `var(--color-accent)` respectively.
- The `color` prop that currently defaults to `#6366F1` flips to `var(--color-chart-1)`.
- For multi-series charts (none today, but anticipate): use `chart-1..8` in order per `THEME.md §3`.

## Phase 6 — Cleanup

- Delete any orphaned CSS from `globals.css` (`.metric-card`, `.tooltip-*`, `.animate-in`) once no JSX references them.
- Grep for remaining old tokens and hex codes:
  - `--color-void`, `--color-surface-`, `--color-text-primary|secondary|tertiary`, `--color-accent` (old), `--color-green|red|purple|amber` — should be zero matches in `dashboard/src/`.
  - Hex codes `#6366F1`, `#1F1F2E`, `#252536`, `#E8E8ED`, `#56566A` — should be zero.
  - `dark:` Tailwind variants — should be zero (the theme handles dark mode via CSS variable remap).
- Delete `src/components/org-switcher.tsx`, any other hand-rolled primitives superseded by shadcn equivalents.
- Final wiki pass: verify `wiki/dashboard.md`, `wiki/conventions.md`, `wiki/log.md` all reflect the final state.

---

## Cross-cutting: documentation obligations by phase

Every phase PR must include:
1. A `wiki/log.md` entry (date, pages touched, what changed).
2. Updates to any wiki page whose claims the PR invalidated.

Phase 0 is the heavy doc lift — it sets the rules. Later phases mostly append log entries.

## Acceptance for the whole migration

- Every route under `dashboard/src/app/` renders correctly in both light and dark mode. No `dark:` class in JSX. No hex codes in JSX or styles.
- `src/components/ui/` contains shadcn primitives; `src/components/` contains app-specific compositions of those primitives. No hand-rolled Button/Dialog/DropdownMenu/Select/Tabs/Tooltip/Popover in `src/components/`.
- Theme toggle works, persists, and respects system preference on first visit.
- `wiki/dashboard.md`, `wiki/conventions.md`, `CLAUDE.md`, `docs/decisions/015-*`, `docs/decisions/006-*` (amended) all accurately describe the new direction.
- The `feedback_ux_philosophy.md` memory reflects the new direction.
- `just dashboard-build` passes; Lighthouse scores don't regress meaningfully.

## Risks and mitigations

- **Coexistence period.** All phases are being executed in a single day on the `update-theme` worktree, so the coexistence window is hours, not days. Broken-looking intermediate states are acceptable — don't spend effort on feature flags or gating.
- **Server-component regressions.** shadcn primitives are client components (they wrap Radix). Dropping them into currently-server-rendered places forces a `"use client"` boundary. Mitigation: keep primitives leaf-level — wrap them in small client components, keep the page shell server-side. The existing Suspense/streaming pattern (see `plans/dashboard-streaming.md`) already models this well.
- **`@tailwindcss/typography` incompatibility.** If the docs markdown currently uses `prose` classes, its default color palette won't match our tokens. Mitigation: either configure the typography plugin's CSS vars to our tokens, or stop using `prose` and style explicitly. Decide in Phase 2.
- **Chart color remapping in the wild.** If any metric-detail page has saved chart configuration persisted somewhere (e.g., a user picking colors), we'd break it. Current audit: no such persistence exists. Confirm before Phase 5.
- **ADR-006 ambiguity.** Amending an ADR is unusual for this repo (the precedent is supersession via a new ADR). Mitigation: ADR-015 explicitly amends rather than supersedes, with both ADRs linking to each other. If reviewers prefer full supersession, restructure in review.
