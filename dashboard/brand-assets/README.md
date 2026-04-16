# AX Brand Assets

Authoritative brand package: wordmark (Concept A) and symbol (Symbol 2 with end ticks).
Everything here derives from the Parchment & Clay palette.

Full product name: **AX** (Agentic Experience).

This directory holds the **sources of truth** for the logo — the SVG vectors and the
brand contract. The actively-served files (React components, favicon, PWA icons, OG
images, manifest) have been installed into the app; see "Where installed assets live"
below.

## Folder layout

```
brand-assets/
├── README.md    ← this file — brand contract
└── svg/         ← authoritative vector sources (edit here, re-render rasters from these)
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

## SVG sources (`svg/`)

Two strategies are provided. Pick whichever fits your pipeline:

**Fixed colors** — ready to drop anywhere, don't rely on any CSS context.

- `ax-wordmark.svg` / `ax-wordmark-dark.svg`
- `ax-mark.svg` / `ax-mark-dark.svg`

**`currentColor` + CSS variable** — inherit ink from `color` and clay from `--ax-clay`. Best for inlining into React/HTML where the mark should automatically follow your theme.

- `ax-wordmark-currentcolor.svg`
- `ax-mark-currentcolor.svg`

**Favicon-specific**

- `ax-favicon.svg` — auto-adapts to `prefers-color-scheme` via an inline `<style>` block. The file currently served at `src/app/icon.svg` is derived from this.
- `ax-favicon-small.svg` — chunkier geometry tuned for 16/32px rasterization if you prefer to roll your own pipeline.

---

## Where installed assets live

These were copied out of `brand-assets/` during Phase 0 foundation and are now served by the app directly. Update them **here first**, then re-install, to avoid drift.

| Concern | Path | Notes |
|---|---|---|
| Logo React components | `src/components/logo/` | `Mark`, `Wordmark`, `Logo`. Inherit `currentColor` for ink, `var(--ax-clay)` for the dot. |
| Favicon (SVG) | `src/app/icon.svg` | Next.js file-convention — served at `/icon.svg` automatically. |
| Favicon (ICO) | `src/app/favicon.ico` | Served at `/favicon.ico`. |
| Favicon (PNG fallback) | `src/app/icon.png` | Served at `/icon.png`. |
| Apple touch icon | `src/app/apple-icon.png` | 180px, served at `/apple-icon.png`. |
| Open Graph image | `src/app/opengraph-image.png` | 1200×630, served at `/opengraph-image.png`. |
| Twitter card image | `src/app/twitter-image.png` | 1200×630, served at `/twitter-image.png`. |
| PWA manifest | `src/app/manifest.webmanifest` | Served at `/manifest.webmanifest`. References absolute PNG URLs. |
| PWA icons | `public/ax-icon-{192,512,maskable-192,maskable-512}.png` | Served at their literal paths (matching the manifest). |
| `--ax-clay` token | `src/app/globals.css` | Aliased to `--color-primary`; logo accent themes automatically. |
| Browser-chrome `themeColor` | `src/app/layout.tsx` (`viewport` export) | `#FAF5EC` light / `#14110C` dark. |

## React component usage

TSX components sized with `currentColor` for ink and `var(--ax-clay)` for the accent. Use them when you want the logo to automatically match your theme context.

```tsx
import { Logo, Mark, Wordmark } from "@/components/logo";

// Header — wordmark that follows text color
<Wordmark className="h-7 w-auto text-foreground" />

// Tight placements (avatars, badges, tab icons)
<Mark className="h-6 w-6 text-foreground" />

// Convenience wrapper
<Logo variant="mark" className="h-8 w-8 text-foreground" />
```

---

## Regenerating rasters

PNG favicons, PWA icons, OG images, and Twitter card images are rendered from the SVG sources in `svg/` via `cairosvg` (`render_pngs.py` + `render_og.py` from the original design session). If you edit geometry in `svg/`, re-run those scripts and copy the outputs into:

- `src/app/` (for Next.js file-convention assets: `icon.png`, `apple-icon.png`, `opengraph-image.png`, `twitter-image.png`, `favicon.ico`)
- `public/` (for PWA icons referenced by absolute URL in the manifest)

Keep the filenames matching the existing ones so Next.js and the manifest continue to resolve them.

## Don'ts

- Don't stretch or rotate the mark.
- Don't fill the dot with anything other than clay.
- Don't recolor the ticks to clay.
- Don't add a box, shadow, or gradient behind the mark — the parchment surface does the work.
- Don't use the wordmark below 96px wide. Use the symbol instead.
