# AX Metrics — Theme Guide

> **Palette:** Parchment & Clay (v1) · **Stack:** Tailwind v4 + Next.js · **Source of truth:** [`src/app/globals.css`](./src/app/globals.css)

This is the canonical reference for visual design in AX Metrics. Read this before styling new UI. Update this file when palette decisions change — stale docs misguide both humans and agents.

---

## 1. Philosophy

AX helps teams **reflect together** on how their agentic workflows are going. The design ethos is _curious and non-judgmental_ — think field notebook crossed with an observatory. The visual language must never make the product feel like a leaderboard, a scoreboard, or a performance review.

Three principles flow from this:

**Warm, never cold.** Every neutral carries a touch of yellow/brown. Pure white and pure black never appear in the UI. The page should feel like aged paper, not a computer terminal.

**One hero color, used sparingly.** Terracotta (Clay-500, `#B0602F`) is the _only_ brand color. It appears on the logo mark, primary CTAs, active nav states, PR links, and brand-forward moments. It does **not** appear on status badges, metric values, or anywhere that could imply "this number is the good one." Protecting the hero color's scarcity is what makes it feel earned.

**Status is language-led, not color-led.** We don't use alarm red. We don't use victory green. Our status palette is olive / ochre / russet / dusk — earthy, adult, non-reactive. "Needs discussion" is a conversation starter, not a verdict.

---

## 2. How the token system works

Three tiers, from abstract to concrete:

| Tier                 | Example                                                         | When to use                                           |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **Raw palette**      | `--color-clay-500`, `--color-parchment`, `--color-ochre`        | Rarely. Only when deliberately making a brand moment. |
| **Semantic**         | `--color-primary`, `--color-muted-foreground`, `--color-border` | **99% of components.** Reach for these first.         |
| **Tailwind utility** | `bg-primary`, `text-muted-foreground`, `border-border`          | In JSX/HTML. Auto-generated from semantic tokens.     |

Dark mode swaps the semantic tokens' _values_. Utility class names don't change. Never write a `dark:` variant for a color that already has a semantic token — the token has already been remapped.

```tsx
// ✅ Good — one class, theme-aware automatically
<button className="bg-primary text-primary-foreground">Start retro</button>

// ❌ Bad — fighting the token system
<button className="bg-clay-500 dark:bg-clay-dark-500 text-white">Start retro</button>
```

---

## 3. Semantic token reference

Use this as your decision tree. If a token you need isn't here, check whether a raw palette token fits before inventing a new semantic.

### Surfaces

| Token                                | Use for                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `background` / `foreground`          | The page. Body text on the page.                       |
| `card` / `card-foreground`           | Raised surfaces: KPI cards, panels, modal bodies.      |
| `popover` / `popover-foreground`     | Floating surfaces: tooltips, dropdowns, command menus. |
| `muted` / `muted-foreground`         | Sunk wells, code blocks, inline metadata, timestamps.  |
| `secondary` / `secondary-foreground` | Secondary button backgrounds. Subtle chips.            |

### Brand & interaction

| Token                            | Use for                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `primary` / `primary-foreground` | Filled primary CTAs. Logo mark background. Active-nav fills (sparingly).                                           |
| `accent` / `accent-foreground`   | Soft brand-tinted states: hover highlights, selected nav items, focused KPI cards. Think "selection," not "brand." |
| `ring`                           | Focus ring on interactive elements. Always `primary`-colored.                                                      |
| `border` / `input`               | Hairline dividers, input borders.                                                                                  |

### Status — use with care

| Token                       | Meaning                                          | Visual                    |
| --------------------------- | ------------------------------------------------ | ------------------------- |
| `success`                   | "Healthy flow" / positive observation            | Olive — not victory green |
| `notice`                    | "Worth a look" / worth discussing                | Ochre                     |
| `attention` / `destructive` | "Needs discussion" / critical destructive action | Russet — not alarm red    |
| `info`                      | Neutral metadata, category pills                 | Dusk blue                 |

Every status token has a `-foreground` sibling usable as a soft background in pills and callouts.

### Data viz

Use `chart-1` through `chart-8` in this order. The first four are maximally distinguishable and cover the common case. Warm and cool alternate, which helps users with deuteranopia/protanopia tell series apart.

| Slot      | Hex (light)          | Hex (dark) | Role                     |
| --------- | -------------------- | ---------- | ------------------------ |
| `chart-1` | `#B0602F` Clay       | `#D68250`  | Default / primary series |
| `chart-2` | `#3E5875` Dusk       | `#7B95B8`  | Second series            |
| `chart-3` | `#5F7340` Olive      | `#99B56A`  | Third series             |
| `chart-4` | `#9A7A22` Ochre      | `#D4AC51`  | Fourth series            |
| `chart-5` | `#734A63` Plum       | `#B088A0`  | Extended                 |
| `chart-6` | `#2F6267` Pine       | `#5A9BA1`  | Extended                 |
| `chart-7` | `#95524E` Rose-stone | `#D08E88`  | Extended                 |
| `chart-8` | `#5E5444` Graphite   | `#B8AC96`  | Extended                 |

For **sequential** data (heatmaps, density), use tints/shades of a single chart slot — don't invent a gradient from scratch. For **diverging** data (sentiment, delta-from-baseline), pair `chart-2` (dusk) on the low end with `chart-1` (clay) on the high end, muted-foreground at the midpoint.

### Sidebar (if using shadcn's sidebar component)

`sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border`, `sidebar-ring` — all pre-mapped for you. No further setup needed.

### Brand assets

The AX logo components (`<Mark>`, `<Wordmark>`, `<Logo>`) live at `src/components/logo/`. They use `currentColor` for the ink strokes (follows the surrounding `text-*` class) and `var(--ax-clay)` for the accent dot. `--ax-clay` is aliased to `--color-primary` in `globals.css`, so it brightens from `#B0602F` → `#D68250` in dark mode automatically.

The authoritative SVG sources, PNG rasters, favicon files, and PWA icons live under `brand-assets/` at the dashboard root. Full usage guidance: [`brand-assets/README.md`](./brand-assets/README.md).

Usage:

```tsx
import { Logo, Mark, Wordmark } from "@/components/logo";

<Wordmark className="h-7 w-auto text-foreground" />   // headers
<Mark className="h-6 w-6 text-foreground" />          // tight placements
<Logo variant="mark" className="h-8 w-8" />           // convenience wrapper
```

---

## 4. Dos and don'ts

**Do** use `primary` for the _one_ brand-forward action on a view. A view with two primary buttons is almost always a design mistake.

**Don't** use `primary` as a status indicator. A `merged` pill is `success` (olive). A "high-value metric" is not colored differently from a "low-value metric" — in AX, the user decides what's good.

**Do** use `accent` / `accent-foreground` for hover, selected, and focused states where you want a gentle brand tint without filling the element.

**Don't** invent new status colors. If you need to signal a new concept, talk to the team — the earthy, non-judgmental palette is a brand decision, and adding a "critical red" slot undermines the ethos.

**Do** use `muted-foreground` for timestamps, helper text, units, and metadata. It's been contrast-tuned to pass AA at 13px (5.1:1 light / 6.4:1 dark).

**Don't** use `stone` or other raw palette grays for text. Semantic tokens are contrast-audited; raw neutrals are not guaranteed to pass AA at small sizes.

**Do** use the `font-serif` family sparingly — page titles, pull quotes, editorial moments. It gives AX its field-notebook voice.

**Don't** set the serif for body UI. Keep sans-serif for density and legibility.

**Do** use `shadow-sm` or `shadow-md` on cards. The shadows are warm-tinted (ink, not black), which preserves the aesthetic.

**Don't** use harsh `shadow-xl` / `shadow-2xl`. The palette is restrained; heavy elevation breaks the "paper" feel.

---

## 5. Dark mode

Dark mode is activated by a `.dark` class on `<html>` (shadcn convention), driven by `next-themes`. To use `data-theme="dark"` instead, change the `@custom-variant` declaration at the top of `src/app/globals.css`.

Dark mode is **warm ink** (`#14110C`), never pure black or OLED black. The hero brightens from `#B0602F` to `#D68250` to hold WCAG AA contrast on the darker ground. This is handled automatically when you use `bg-primary` — no `dark:` variant needed.

Light mode is the product default; dark mode is user-toggleable via the theme toggle in the sidebar / marketing header. First-visit preference honors the user's OS setting.

---

## 6. Accessibility contract

All semantic token pairs meet **WCAG AA (4.5:1 for normal text, 3:1 for large text & UI components)** in both light and dark modes. Notable ratios:

| Pair                               | Light    | Dark                                       |
| ---------------------------------- | -------- | ------------------------------------------ |
| `foreground` on `background`       | 14.8 : 1 | 14.2 : 1                                   |
| `muted-foreground` on `background` | 5.1 : 1  | 6.4 : 1                                    |
| `primary-foreground` on `primary`  | 4.8 : 1  | 4.8 : 1                                    |
| `accent-foreground` on `accent`    | 7.7 : 1  | 5.9 : 1                                    |
| `ring` on `background`             | 3.0 : 1  | 3.1 : 1 (non-text, UI component threshold) |

When introducing a new color relationship, **verify contrast before merging**. A quick rule of thumb: if you're using the color for text, it must hit 4.5:1 against its background, or 3:1 if the text is ≥18px or ≥14px bold.

Chart colors hit ≥3:1 against both light and dark backgrounds so small dots/lines remain perceivable. For small visualization marks (<3px lines, <5px dots), pair color with a second channel (shape, dash pattern, direct label) — never rely on color alone.

---

## 7. When to update this file

Update `THEME.md` and `src/app/globals.css` together when:

- Adding or removing a semantic token
- Changing a brand-level value (hero color, primary neutral, status philosophy)
- Introducing a new component pattern that doesn't fit existing tokens

Do **not** update this file when:

- Styling a one-off component (compose from existing tokens instead)
- Temporarily tweaking a color for an experiment (use a local override)

If you find yourself reaching for a raw palette token (`--color-clay-600`, `--color-stone`) in a component, that's a signal to either (a) use an existing semantic token you overlooked, or (b) propose a new semantic token in a PR that updates both files together.

---

## 8. File map

```
dashboard/
├── THEME.md                ← This file. Usage rules and reasoning.
└── src/app/globals.css     ← Tokens and base layer. Imported once from
                              the root layout. Source of truth for values.
```

Primitive UI components come from [shadcn/ui](https://ui.shadcn.com/) under `src/components/ui/`. Application-specific components live under `src/components/` and compose the primitives. Add new primitives with `npx shadcn@latest add <name>`.
