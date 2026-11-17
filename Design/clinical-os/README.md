# Kiorly Clinical OS

| Field | Value |
|-------|--------|
| **Design name** | Kiorly Clinical OS |
| **Artifact** | Screen Explorer (interactive HTML prototype) |
| **Version** | 2026-11-17 |
| **Production status** | **Shipped** as app themes `clinical-os-light` / `clinical-os-dark` (`apps/web/src/styles/clinical-os-theme.css`) |

## What it is

**Kiorly Clinical OS** is a forward-looking clinic operating-system shell: Inter typography, blue primary, gold ECG brand mark, dense clinical tables, SOAP encounter layout, front-desk queue, and platform-operator views. The tagline in the prototype is *Clinic operating system*.

It complements **Kiorly Default** and **Material Design 3** (the themes users switch today in the product). Clinical OS is the target layout/navigation vocabulary for a future implementation pass — use it for reviews, demos, and incremental porting of components.

## Files

| Path | Purpose |
|------|---------|
| [`screen-explorer.html`](./screen-explorer.html) | Hash-routed prototype (~50 screens); demo data only |
| [`reference-boards/`](./reference-boards/) | Exported concept stills (`1.png`–`5.png`) |
| [`implementation-assets/`](./implementation-assets/) | Tokens, SVG brand/illustrations, icon registry, example TSX — see its [`README.md`](./implementation-assets/README.md) |

## How to view

1. Open `screen-explorer.html` in a browser (double-click or `npm run design:clinical-os` from repo root).
2. Use the left nav or URL hash (`#dashboard`, `#patient`, `#front-desk`, …).
3. Toggle **light / dark** and **collapse sidebar** — preferences persist in `localStorage` (`kiorly-dark`, `kiorly-collapsed`).

Buttons show alerts: *“Design prototype only — … will be wired to the Kiorly API during implementation.”*

## Implementing in the monorepo

Follow the copy checklist in `implementation-assets/README.md`. Preserve existing **auth-aware navigation** (`showNavItem`, RBAC); do not replace permission gating with the prototype’s static nav list.

**Runtime theme ids:** `clinical-os-light`, `clinical-os-dark` (theme switcher + `html.theme-clinical-os`).

## Source

Imported from author design package (iCloud): `Kiorly/Design` — November 2026.