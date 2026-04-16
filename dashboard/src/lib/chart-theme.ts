/**
 * Theme-aware chart color helpers. Chart components (recharts and friends)
 * need concrete color strings — they can't read Tailwind utilities. This
 * module returns CSS var references that resolve at render time, so charts
 * automatically track light/dark mode without a re-render.
 *
 * Use `chartColor(n)` for the Nth categorical series (`chart-1` through
 * `chart-8`, ordered for distinguishability per THEME.md §3). Use
 * `themeVar(token)` for any other semantic token a chart needs (tooltip
 * background, axis stroke, cursor fill, etc.) so no hex codes leak into
 * chart code.
 */

type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function chartColor(slot: ChartSlot): string {
  return `var(--color-chart-${slot})`;
}

/**
 * Reference any semantic token from the Parchment & Clay theme as a CSS
 * `var()` string — the same token name used in Tailwind utilities.
 * Example: `themeVar("card")` → `"var(--color-card)"`.
 */
export function themeVar(
  token:
    | "background"
    | "foreground"
    | "card"
    | "card-foreground"
    | "popover"
    | "popover-foreground"
    | "primary"
    | "primary-foreground"
    | "secondary"
    | "secondary-foreground"
    | "muted"
    | "muted-foreground"
    | "accent"
    | "accent-foreground"
    | "destructive"
    | "destructive-foreground"
    | "border"
    | "input"
    | "ring"
    | "success"
    | "notice"
    | "info"
    | "attention",
): string {
  return `var(--color-${token})`;
}
