# ADR-015: Parchment & Clay Design System + shadcn/ui

## Status
Accepted

## Date
2026-04-16

## Context

The dashboard was built against a Linear-inspired, dark-mode-only palette (indigo accent on `#08080D` near-black surfaces). Two problems surfaced over time:

1. **The palette worked against the product ethos.** AX's whole point is that teams reflect together on how their agentic workflows are going — curious, non-judgmental, not a leaderboard. An indigo-on-near-black "sleek SaaS" palette read as performance-review territory, especially on pages full of numbers. Dark mode first reinforced a "terminal / cockpit" feel, when the intended feel is "field notebook / observatory."

2. **Every primitive was hand-built.** No Button, Dialog, DropdownMenu, Select, Tabs, Tooltip, Popover, Skeleton, or Sidebar component existed — each usage was hand-rolled from raw Tailwind plus manual Radix-style behaviors (e.g. `OrgSwitcher` implementing click-outside detection by hand). This caused drift (two dropdowns with different keyboard behavior, three different focus-ring styles) and slowed every UI change.

Separately, a design exploration produced a new **Parchment & Clay** palette: warm, light-by-default, with terracotta (`#B0602F`) as a sparingly-used hero color and earthy status colors (olive/ochre/russet/dusk) that refuse to read as "verdicts." The palette was built with shadcn/ui-compatible token names so it would drop into that component system without remapping.

## Decision

Two decisions, taken together because they hinge on each other:

1. **Adopt the Parchment & Clay theme as the dashboard's canonical design system.** Source of truth lives in `dashboard/src/app/globals.css` (tokens) and `dashboard/THEME.md` (usage guide). Light mode is the default; dark mode is reachable via a persistent user toggle wired through `next-themes`. Every color reference in components flows through semantic tokens (`primary`, `muted-foreground`, `border`, `success`, `chart-1..8`, etc.) — `dark:` Tailwind variants are forbidden for tokens that already have a semantic name, because the tokens remap automatically.

2. **Adopt [shadcn/ui](https://ui.shadcn.com/) as the primitive component library.** Primitives live under `dashboard/src/components/ui/`, installed on demand with `npx shadcn@latest add <name>`. Application components under `dashboard/src/components/` compose the primitives. Hand-rolled Button / Dialog / DropdownMenu / Select / Tabs / Tooltip / Popover / Skeleton / Sidebar are not allowed going forward.

### Relationship to ADR-006

This ADR **amends** ADR-006 ("Linear-inspired Dashboard UX"). The principles of ADR-006 remain authoritative:

- Inline explanations on every metric card
- Plain-language trend summaries
- Visual hierarchy — surface what's interesting
- Clean typography, restrained palette, content-forward

The **palette implementation** changes:

| Was (ADR-006) | Is (ADR-015) |
|---|---|
| Linear-inspired visual language | Field-notebook / observatory visual language |
| Dark mode first, light mode is a follow-up | Light mode default, dark mode first-class via toggle |
| Indigo `#6366F1` primary | Terracotta `#B0602F` primary (Clay-500), `#D68250` on dark |
| Status colors: green / red / amber | Status colors: olive / ochre / russet / dusk (non-judgmental) |
| Geist sans + mono, loaded from CDN | System-first sans, `font-serif` for editorial moments, no webfonts |
| All primitives hand-rolled | Primitives from shadcn/ui |

## Alternatives Considered

- **Keep the current palette, just add shadcn.** Rejected: shadcn's token names are designed for a specific semantic shape (`primary`, `muted`, `accent`, etc.). Bolting it onto the old `--color-void` / `--color-surface-0..3` schema would require custom mapping in every primitive, defeating the point. The new palette was designed to be shadcn-compatible, so doing both moves together is strictly less work than doing them separately.
- **Adopt a larger component library (MUI, Mantine, Chakra).** Rejected: too opinionated, too much bundle weight, and we'd be fighting its theme system to express Parchment & Clay. shadcn is copy-paste source — we own and edit the code directly.
- **Build our own primitive layer.** Rejected: we had this, it didn't work (see Context). shadcn gives us Radix-level accessibility and keyboard behavior for free.
- **Dark mode only (keep the current default, just re-skin).** Rejected: the warm palette's distinctive feel is clearest in light mode (the "aged paper" metaphor). Dark is still fully supported — and brighter Clay-dark-500 holds AA contrast on `#14110C` midnight — but light is the product's face.

## Consequences

**Easier:**
- Every new component is a composition of shadcn primitives + Tailwind utilities. No more hand-building Dialog focus traps or DropdownMenu keyboard nav.
- Theme changes (hover states, focus rings, disabled states) flow through token remaps instead of hunting down hex codes.
- Light / dark feature-parity is automatic — any component using semantic tokens works in both modes with zero additional code.
- The palette itself reinforces the product ethos (team reflection, not individual ranking), so design decisions have a clearer anchor.

**Harder:**
- Short-term migration work: every existing dashboard route needs to be re-skinned against the new tokens. Tracked in `plans/dashboard-theme-migration.md`.
- Recharts color references currently hard-coded in JSX must be rewritten to pull from CSS variables via `src/lib/chart-theme.ts`.
- Server-component-heavy pages must introduce small client-component wrappers where shadcn primitives are used (shadcn wraps Radix, which is client-only). Existing Suspense/streaming patterns (see `plans/dashboard-streaming.md`) already model this well.

**Durable guardrails:**
- `CLAUDE.md`, `wiki/dashboard.md`, `wiki/conventions.md`, and `dashboard/THEME.md` all agree on these rules so future contributors (human or agent) default to the new direction without needing to be told.
- `dashboard/THEME.md §7` defines when to update the theme vs. compose existing tokens — so the semantic layer doesn't bloat over time.
