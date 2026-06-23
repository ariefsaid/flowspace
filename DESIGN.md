---
# DESIGN.md — FlowSpace design system (reverse-engineered from the live product)
# Token source of truth. No raw hex/px in components — use these Tailwind classes/tokens.
# The original is a shadcn/ui + Tailwind app: slate neutrals, TEAL primary, ORANGE accent, Inter.
colors:
  # neutrals (shadcn slate scale)
  foreground: "#020817"        # slate-950 — body text (text-slate-950)
  heading: "#111827"           # gray-900 — h1/h2 headings (text-gray-900)
  heading-soft: "#1f2937"      # gray-800 — h3 (text-gray-800)
  muted: "#6b7280"             # gray-500 — secondary/sub text
  border: "#e2e8f0"            # slate-200 — default borders (border-slate-200)
  background: "#ffffff"        # white page bg
  surface-muted: "#f8fafc"     # slate-50 — subtle section bg
  # brand
  primary: "#14b8a6"           # teal-500 — solid fills/buttons (white text is large-only on teal-500; hover→teal-600)
  primary-strong: "#0d9488"    # teal-600 (hover / solid-button hover)
  primary-fg: "#ffffff"
  # hero/value gradient endpoints — DARKENED for WCAG-AA (see "WCAG-AA divergence" note below).
  # Both white value text (large/bold) AND white subtext pass AA across the whole gradient.
  hero-gradient-from: "#115e59" # teal-800 — lightest endpoint = worst case: white 5.55:1 (AA pass)
  hero-gradient-to: "#134e4a"   # teal-900 — white 6.96:1 (AA pass)
  accent: "#f97316"            # orange-500 — decorative / gradient START only (never small body text)
  accent-strong: "#c2410c"     # orange-700 — accent TEXT on white: 4.78:1 (AA pass). Was orange-600 #ea580c (3.56:1, FAIL).
  print: "#a855f7"             # purple-500 (print quick-action), purple-600 #9333ea
  # semantic / status
  success: "#16a34a"           # green-600 (COMPLETED) — bg green-100 / text green-700
  warning: "#ca8a04"           # yellow-600 (PENDING / Menunggu) — bg amber-100 / text amber-700
  info: "#2563eb"              # blue-600 — bg blue-50 / border blue-200 (#bfdbfe)
  danger: "#dc2626"            # red-600 (logout / destructive)
typography:
  font: "Inter (next/font), system fallback"
  base: "16px"                 # root
  h1: "30px / 700 / 36px lh / gray-900"     # text-3xl font-bold
  h2: "20px / 700 / 28px lh"                # text-xl font-bold (white on hero)
  h3: "18px / 600 / 28px lh / gray-800"     # text-lg font-semibold
  body: "16px / 400 / slate-950"
  small: "14px"                # text-sm (card labels, buttons)
  xs: "12px"                   # text-xs (nav meta, timestamps)
spacing:
  card-padding: "16px"         # p-4 (compact) — large cards p-6
  section-gap: "24px"          # gap-6 / space-y-6
  page-x: "container mx-auto px-4"
rounded:
  sm: "10px"                   # rounded-[10px] (nav buttons/pills)
  DEFAULT: "12px"              # rounded-xl — cards, buttons, inputs
  full: "9999px"               # pills / badges / avatars
elevation:
  card: "shadow-sm"            # 0 1px 2px rgba(0,0,0,.05)
  raised: "shadow-md"          # 0 4px 6px -1px rgba(0,0,0,.1) — CTAs, KPI tiles, popular cards
  nav: "backdrop-blur-md bg-white/80 border-b border-slate-200"  # sticky glass nav, h-[65px]
components:
  - button-primary | gradient-teal | button-accent | button-outline | icon-button
  - card | stat-tile | badge(status) | tabs | input | select | wizard-stepper | menu-item-card | qr-card
---

# FlowSpace — Design System

Reverse-engineered (computed styles) from the live product on 2026-06-15. The original is a
**shadcn/ui + Tailwind CSS** Next.js app. Identity = **teal primary + orange accent on slate
neutrals, Inter type, rounded-xl, soft shadows, glass sticky nav.** Preserve it exactly, **except**
the two contrast-corrected tokens documented in **WCAG-AA divergence** below (owner-approved).

## Overview
- Clean, rounded, friendly SaaS look. White surfaces on white page; structure comes from `slate-200`
  borders + `shadow-sm`, not heavy fills.
- **Teal** is the brand/primary (buttons, active nav, links, KPI accents). **Orange** is the
  energetic accent/CTA (gradient buttons like "Order Cafe", hero word accent). **Purple** appears
  only on the print quick-action.
- Indonesian copy (`id-ID`). Currency `Rp` with dot thousands (e.g. `Rp 75.000`).

## Colors (use Tailwind palette classes directly — they match the original 1:1, except the two AA-corrected tokens)
- Text: `text-slate-950` body, `text-gray-900` h1/h2, `text-gray-800` h3, `text-gray-500` muted.
- Brand: `bg-teal-500` / `hover:bg-teal-600`, links `text-teal-600`. Outline btn `border-2 border-teal-600 text-teal-600`.
- Hero / value gradient (white value text + white subtext): `bg-gradient-to-br from-teal-800 to-teal-900` —
  subtext is `text-white` (NOT `text-teal-100`). Both pass WCAG-AA across the whole gradient (worst case = teal-800 ≈ 5.55:1).
  **AA-corrected** from `from-teal-500 to-teal-600` + `text-teal-100` (failed AA). See divergence note.
- Accent CTA gradient (large/bold white button text): `bg-gradient-to-r from-orange-500 to-orange-600` (text white, `shadow-md`) — unchanged; large bold white passes ≥3:1.
- Accent TEXT on white (normal-size, e.g. emphasized words/prices): `text-orange-700` (4.78:1, AA pass).
  **AA-corrected** from `text-orange-600` (#ea580c, 3.56:1, failed AA normal text). See divergence note.
- Print action gradient: `bg-gradient-to-r from-purple-500 to-purple-600`.
- Borders `border-slate-200`; info cards `border-blue-200 bg-blue-50`; highlighted card `border-2 border-teal-500`.
- Status badges (rounded-full, text-xs, font-medium): COMPLETED/Selesai = `bg-green-100 text-green-700`;
  PENDING/Menunggu/WAITING = `bg-amber-100 text-amber-700`; ACTIVE/AKTIF = `bg-teal-100 text-teal-700`;
  CANCELLED = `bg-red-100 text-red-700`; PAID ONLINE/info = `bg-blue-100 text-blue-700`.

## Typography
Inter via `next/font` (already wired in `app/layout.tsx`). Root 16px. Use Tailwind: `text-3xl font-bold`
(h1), `text-xl font-bold` (h2), `text-lg font-semibold` (h3), `text-sm` labels/buttons, `text-xs` meta.

## Layout
- Sticky top nav, `h-[65px]`, `backdrop-blur-md bg-white/80 border-b border-slate-200`. Brand (logo tile +
  "FlowSpace") left; nav links center (icon + label, active = teal); user name + "Keluar" right.
- Page content: `container mx-auto px-4 py-6` (or `max-w-6xl`). Section spacing `space-y-6`.
- Footer (public): dark (`bg-slate-900` text white) with brand + copyright.

## Shapes & Elevation
- Radius: cards/buttons/inputs `rounded-xl` (12px); nav pills/small `rounded-[10px]`; badges/avatars `rounded-full`.
- Shadows: cards `shadow-sm`; CTAs / KPI tiles / "popular" cards `shadow-md`. No heavy/fake-depth shadows.

## Component patterns (build these as shared primitives in `components/ui/`)
- **Button**: variants `primary` (bg-teal-500 hover:teal-600 text-white), `accentGradient`
  (from-orange-500 to-orange-600 text-white shadow-md — large bold white, ≥3:1 OK), `outline` (border-2 border-teal-600 text-teal-600),
  `ghost`, `danger` (text-red-600). All `rounded-xl`, `text-sm font-medium`, padding `px-4 py-2` (lg: `p-4`).
- **Card**: `rounded-xl border border-slate-200 bg-white shadow-sm`; padded `p-4`/`p-6`. Variants: highlighted
  (`border-2 border-teal-500 shadow-md`), info (`border-blue-200 bg-blue-50`).
- **HeroCard / value tile** (gradient revenue/value surfaces — landing hero, admin dashboard + print-reports revenue
  cards, ActiveSessionCard, cafe, guest cafe, BrandMark): `bg-gradient-to-br from-teal-800 to-teal-900`, white value
  text, **white** subtext (not teal-100). AA-corrected — see divergence note.
- **StatTile**: card with label (text-sm gray-500), big value (text-2xl/3xl font-bold gray-900), unit, and a
  right icon in a tinted rounded square. (Accent emphasis text uses `text-orange-700`, not orange-600.)
- **Badge**: rounded-full text-xs font-medium, status color map above.
- **Tabs**: underline/pill tablist (active = teal text + indicator).
- **Input/Select**: `rounded-xl border border-slate-200 px-3 h-10`, icon-prefixed where shown.
- **WizardStepper**: numbered circles (active teal, done teal-check, todo slate) + connectors.
- **MenuItemCard** (cafe): emoji, name, category chip, price, description, "Tambah"/"Pilih Variant" button.
- **QrCard**: bordered card with QR + "Refreshes in Ns" countdown.

## Do's & Don'ts
- DO use the Tailwind palette classes named above (they ARE the original values, **except** the two AA-corrected
  tokens — hero gradient teal-800/900 + white subtext, and accent text orange-700 — documented below). DO keep teal=brand, orange=accent.
- DON'T introduce new brand colors/fonts, purple-on-everything, or fake-depth shadows.
- DON'T put white SMALL text on `teal-500`/`teal-600`, or `text-orange-600`/`text-teal-100` for readable text — they fail WCAG-AA.
- DON'T hardcode the client brand name — use `brand.config.ts` / `NEXT_PUBLIC_BRAND_NAME` (renders "FlowSpace").

## WCAG-AA divergence (owner-approved 2026-06-23)
Two reverse-engineered original colors failed WCAG-AA contrast. The owner explicitly approved correcting them
even though it **diverges from the pixel-perfect replica** — accessibility wins over fidelity for these two tokens.
This is a **deliberate, owner-approved divergence from the captured original**, not a regression. All other tokens
remain 1:1 with the original. Contrast computed via WCAG relative-luminance (sRGB-linearized), ratio = (L1+0.05)/(L2+0.05).

| token / usage | from (original, FAIL) | to (corrected, PASS) | before | after | AA threshold |
|---|---|---|---|---|---|
| Hero/value gradient endpoints (white **value** text, large/bold) | `from-teal-500 to-teal-600` | `from-teal-800 to-teal-900` | 2.30:1 (teal-500) | 5.55:1 (teal-800, worst case) | ≥3:1 (large) |
| Hero/value gradient **subtext** (small) | `text-teal-100` on teal-500/600 | `text-white` on teal-800/900 | ≈2.2:1 | 5.55:1 (worst case, white on teal-800) | ≥4.5:1 (normal) |
| Accent emphasis text on white (normal size) | `text-orange-600` (#ea580c) | `text-orange-700` (#c2410c) | 3.56:1 | 4.78:1 | ≥4.5:1 (normal) |

Notes:
- **Lightest endpoint is the worst case** on a gradient. `from-teal-700 to-teal-800` was rejected: the teal-700 end
  gives white small subtext only **4.21:1** (<4.5, FAIL). `from-teal-800 to-teal-900` clears 4.5:1 for white small text
  everywhere (5.55:1 worst case) while keeping a recognizable dark-teal brand surface.
- Subtext changed from `text-teal-100` to plain `text-white`: teal-100 is too light to reach 4.5:1 on any acceptably
  dark teal, so white is the readable, brand-consistent choice.
- The **orange CTA gradient button** (`from-orange-500 to-orange-600`, white text) is unchanged — its text is
  large/bold (≥3:1 threshold), which it meets. Only **small/normal `text-orange-600`** failed and moved to orange-700.
- Affected components for the gradient (~7): landing hero, admin dashboard revenue card, print-reports revenue card,
  ActiveSessionCard, cafe, guest cafe, BrandMark. Affected for accent text (~6): per design-review sweep.
