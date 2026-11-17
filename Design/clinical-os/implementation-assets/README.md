# Kiorly — Implementation Assets v1.0

## What is inside

This is a **source-asset starter kit**, not a replacement for the production application. It includes exact repo-derived Kiorly SVG logo, light/dark/mono logo variants, PNG renditions in 9 sizes each, 7 original editable SVG illustrations with 3 raster sizes, a semantic token JSON and CSS theme file, a Lucide icon registry mapped to dependencies already installed in Kiorly, and self-contained example React/TSX components (collapsible sidebar, brand, mobile nav, status chips, stat card, empty state, demo dashboard). It also includes source-derived routes and subview inventory and reference concept boards.

**Brand preservation:** `branding/svg/kiorly-original.svg` exactly matches `apps/web/public/logo.svg` at the inspected revision. Dark variant only replaces black K with off-white; gold ECG remains. No blue K or redesigned logo.

## What to copy (recommended)

1. Copy `branding/svg/kiorly-original.svg` to `apps/web/public/kiorly-assets/logo.svg` and `branding/svg/kiorly-dark.svg` to `apps/web/public/kiorly-assets/logo-dark.svg`. Keep the existing app `/logo.svg` unchanged if already in use.
2. Copy `illustrations/svg/` into `apps/web/public/kiorly-assets/illustrations/`.
3. Copy `src/styles/kiorly-tokens.css` into `apps/web/src/styles/` and import **after** existing global styles, so the overrides apply. Check color contrast and sign-off first. Note the optional Google Fonts import needs a CSP/network policy decision; self-host licensed fonts instead when privacy/performance requires it.
4. Copy `src/components/` to a folder such as `apps/web/src/components/kiorly-kit/`. Install nothing: React, react-router-dom, react-i18next, Tailwind, lucide-react are already dependencies.
5. In the existing `AppShell`, replace only the desktop `<aside>` with `<CollapsibleSidebar links={...}/>` and preserve existing `showNavItem`, permission checks and `<AppNavLinks>` logic; **do not expose unauthorized routes from a static list**. The component accepts caller-filtered `allowed` fields. Default collapse is `false` in storage by design; `false` means not expanded.
6. For mobile web, optionally integrate `KiorlyMobileNav` with four role-specific items, and retain access to other screens via a More page/sheet. This component is a navigation primitive, not a drop-in replacement for your auth-aware AppShell.
7. Add `dir={i18n.dir()}` on your root app container; use `html[lang="ar"]` and `dir="rtl"`. The CSS requests Tajawal 600/700 via an optional external font source; font binaries are **not bundled**.
8. Migrate individual pages incrementally against their existing APIs; the `ExampleDashboard.tsx` contains **DEMO DATA only**.

## Sidebar behavior

Desktop width: collapsed 72px (default), expanded 240px; toggle in sidebar footer, remembers user choice in localStorage. Icons+tooltips when collapsed, labels when expanded. On touch/mobile, recommend a 4-item bottom nav and a More sheet. Respect Arabic RTL using logical CSS properties and localized labels.

## Token compatibility

Existing Kiorly Tailwind expects HSL triplets `hsl(var(--primary))`. The supplied CSS uses the same names and covers `default-light`, `default-dark`, `material-light`, and `material-dark`, so it is compatible with the repo's current theme data attributes; check for CSS specificity clashes with `material-theme.css` and import order.

## Icon licensing

All icon names map to existing `lucide-react`. The kit contains **no copied icon font or vendored third-party icon artwork**. Rendering uses installed package components. Branding/illustrations provided are SVG.

## Concept images vs real assets

The `reference-boards/*.png` are **rasterized design concepts**, useful as visual references, but are not editable per-element Figma screens and do not provide precise source for every patient avatar/photo/chart. Real implementation assets are in `branding/`, `illustrations/`, `design-tokens/`, `icons/`, and `src/`.

**Not provided:** 100% production implementations of 46 routes, actual clinical images/avatars from the AI mockups, font binaries, deployment-ready clinical software, a Figma source file, or a verified exact pixel extraction from generated image boards.

## Accessibility + patient safety

Do not imply drug-interaction clearance without validated backend response; do not expose sensitive clinical records in placeholder components. Add per-role usability testing, WCAG 2.2 AA checks, Arabic RTL QA, keyboard navigation, and no PHI in mock data/snapshots.

See `docs/SCREEN_INVENTORY.md` for all inspected app routes and important nested views. Existing Kiorly project has an auth-aware navigation layer and should remain the source of truth for permission gating.

## Standalone icons

`icons/svg/*.svg` contains 35 original simple stroke icons with CSS `currentColor` and responsive `viewBox` scaling. `icons/png/` contains 24px, 48px, and 96px exports for raster needs; `icons/icon-registry.json` maps all application concepts to the existing Lucide React package. Prefer Lucide React in code for consistency.
