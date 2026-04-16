# AX Brand Assets

Final logo package: wordmark (Concept A) and symbol (Symbol 2 with end ticks).
Everything here is derived from the Parchment & Clay palette.

Full product name: **AX** (Agentic Experience).

## Folder layout

```
ax-brand-assets/
├── svg/          Authoritative vector sources
├── png/          Rendered rasters (favicons, PWA, OG)
├── react/        Drop-in React components
└── next-app/     Files staged for Next.js app router conventions
```

## Color contract

The mark uses two colors only — ink (stroke/text) and clay (accent dot).

| Role    | Light mode | Dark mode  | Notes                         |
| ------- | ---------- | ---------- | ----------------------------- |
| Ink     | `#1E1912`  | `#F1E8D6`  | Axis rule, ticks, wordmark    |
| Clay    | `#B0602F`  | `#D68250`  | The observation dot only      |
| Surface | `#FAF5EC`  | `#14110C`  | Parchment / midnight ink      |

Never color the ticks or rule in clay. The dot is the one warm gesture in the mark — keeping it rare is what makes it read as "a finding" rather than decoration.

## Clear space

Reserve padding equal to the **x-height of the wordmark** (roughly 1/3 of the total logo height) on all sides. For the symbol, reserve padding equal to the **diameter of the clay dot** on all sides.

## Minimum sizes

- **Wordmark**: 96px wide (below that, use the symbol)
- **Symbol**: 16px (a dedicated small-size SVG is included for favicon use)

---

## Files

### SVG sources (`svg/`)

Two strategies are provided. Pick whichever fits your pipeline:

**Fixed colors** — ready to drop anywhere, don't rely on any CSS context.

- `ax-wordmark.svg` / `ax-wordmark-dark.svg`
- `ax-mark.svg` / `ax-mark-dark.svg`

**`currentColor` + CSS variable** — inherit ink from `color` and clay from `--ax-clay`. Best for inlining into React/HTML where the mark should automatically follow your theme.

- `ax-wordmark-currentcolor.svg`
- `ax-mark-currentcolor.svg`

**Favicon-specific**

- `ax-favicon.svg` — auto-adapts to `prefers-color-scheme` via an inline `<style>` block. This is the file to reference from `<link rel="icon" type="image/svg+xml" href="...">`.
- `ax-favicon-small.svg` — chunkier geometry tuned for 16/32px rasterization if you prefer to roll your own pipeline.

### Rendered PNGs (`png/`)

| File                         | Size     | Purpose                               |
| ---------------------------- | -------- | ------------------------------------- |
| `ax-icon-16.png`             | 16       | Browser tab (fallback)                |
| `ax-icon-32.png`             | 32       | Browser tab                           |
| `ax-icon-48.png`             | 48       | Windows site tile                     |
| `ax-icon-192.png`            | 192      | PWA (any)                             |
| `ax-icon-512.png`            | 512      | PWA (any)                             |
| `ax-icon-192-dark.png`       | 192      | PWA variant for dark-themed launchers |
| `ax-icon-512-dark.png`       | 512      | PWA variant for dark-themed launchers |
| `ax-icon-maskable-192.png`   | 192      | PWA (maskable), 80% safe zone         |
| `ax-icon-maskable-512.png`   | 512      | PWA (maskable), 80% safe zone         |
| `apple-touch-icon.png`       | 180      | iOS home screen (parchment bg)        |
| `favicon.ico`                | multi    | 16 / 32 / 48 bundled                  |
| `og-image.png`               | 1200×630 | Open Graph / Twitter card (light)     |
| `og-image-dark.png`          | 1200×630 | Open Graph / Twitter card (dark)      |

### React components (`react/`)

TSX components sized with `currentColor` for ink and `var(--ax-clay)` for the accent. Use them when you want the logo to automatically match your theme context.

```tsx
import { Mark, Wordmark, Logo } from "@/components/logo";

// Header — wordmark that follows text color
<Wordmark className="h-7 w-auto text-foreground" />

// Tight placements (avatars, badges, tab icons)
<Mark className="h-6 w-6 text-foreground" />

// Convenience wrapper
<Logo variant="mark" className="h-8 w-8 text-foreground" />
```

The components expect `--ax-clay` in scope. Add it to your theme so the dot picks up the correct tone in each mode:

```css
/* In theme.css */
@theme {
  --ax-clay: #B0602F;
}
.dark {
  --ax-clay: #D68250;
}
```

(If you're already exposing `--color-primary` from your semantic tokens, you can instead set `--ax-clay: var(--color-primary)` and get the same behavior for free.)

### Next.js app router staging (`next-app/`)

Drop these into your `app/` directory. Next.js picks them up automatically and generates the correct `<head>` tags.

```
app/
├── favicon.ico             → /favicon.ico
├── icon.svg                → <link rel="icon" type="image/svg+xml">
├── icon.png                → <link rel="icon" type="image/png"> (fallback)
├── apple-icon.png          → <link rel="apple-touch-icon">
├── opengraph-image.png     → <meta property="og:image">
├── twitter-image.png       → <meta name="twitter:image">
└── manifest.webmanifest    (see below)
```

The manifest lives at `app/manifest.webmanifest`. In `layout.tsx`, reference it via the metadata API:

```tsx
export const metadata: Metadata = {
  title: { default: "AX", template: "%s · AX" },
  description: "Agentic Experience",
  manifest: "/manifest.webmanifest",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF5EC" },
    { media: "(prefers-color-scheme: dark)",  color: "#14110C" },
  ],
};
```

For the PWA icons themselves (192, 512, maskable) drop the PNG files from `png/` into `public/` — the manifest already references them by absolute path.

---

## For non-Next.js apps

If you're serving static assets directly, the equivalent `<head>` block:

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF5EC">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#14110C">

<!-- Open Graph -->
<meta property="og:image" content="https://your-domain/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://your-domain/og-image.png">
```

---

## Regenerating

The PNG assets are rendered from the SVG sources via `cairosvg`. If you edit the geometry in `svg/`, re-run the render scripts (`render_pngs.py` and `render_og.py` in the working session) to refresh the raster files.

## Don'ts

- Don't stretch or rotate the mark.
- Don't fill the dot with anything other than clay.
- Don't recolor the ticks to clay.
- Don't add a box, shadow, or gradient behind the mark — the parchment surface does the work.
- Don't use the wordmark below 96px wide. Use the symbol instead.
