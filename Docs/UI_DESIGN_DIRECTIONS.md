# UI design directions

| Status | Updated November 2026 |
|--------|------------------------|

Kiorly maintains **multiple UI directions**: two are **shipped** as runtime themes; one is a **reference prototype** for the next shell generation.

Full asset paths: [`Design/`](../Design/README.md).

---

## Kiorly Default

| | |
|--|--|
| **Name** | Kiorly Default Light / Dark |
| **Status** | **Shipped** |
| **Implementation** | `apps/web/src/index.css`, `apps/web/src/stores/theme-store.ts`, `data-theme="default-light"` / `default-dark` |

Default product tokens (HSL CSS variables consumed by Tailwind/shadcn-style components).

---

## Material Design 3

| | |
|--|--|
| **Name** | Material Design 3 Light / Dark |
| **Status** | **Shipped** |
| **Implementation** | `apps/web/src/styles/material-theme.css`, theme switcher in login + app shell |

Roboto-forward surfaces, pill buttons, M3 elevation and primary accent.

---

## Kiorly Clinical OS

| | |
|--|--|
| **Name** | **Kiorly Clinical OS** |
| **Screen Explorer** | Interactive HTML prototype (hash navigation, ~50 views) |
| **Status** | **Shipped** — `clinical-os-light` / `clinical-os-dark` in theme switcher |
| **Location** | [`Design/clinical-os/`](../Design/clinical-os/) |

### Highlights

- Collapsible sidebar (72px / 244px), sticky top bar, role-grouped nav aligned to monorepo routes
- Clinical patterns: Patient 360 tabs, SOAP encounter editor, front-desk queue, waiting-room display
- Light/dark tokens tuned for clinical density (Inter, blue primary, gold logo accent)
- [`implementation-assets/`](../Design/clinical-os/implementation-assets/): semantic tokens JSON/CSS, brand SVGs, Lucide concept registry, optional React starter components

### Open the prototype

```bash
npm run design:clinical-os
```

Or open [`Design/clinical-os/screen-explorer.html`](../Design/clinical-os/screen-explorer.html) in any browser.

### Adoption notes

1. Treat Screen Explorer content as **concept data** — wire real API states and RBAC from `apps/web`.
2. Copy implementation assets incrementally; see `implementation-assets/README.md`.
3. **Runtime:** `apps/web/src/styles/clinical-os-theme.css`, `data-theme="clinical-os-*"`, `html.theme-clinical-os`.

---

## Theme switcher (today)

**Default for new sessions / devices:** **Clinical OS — Light** (`clinical-os-light`). Users can still choose **Kiorly Default** or **Material** (light/dark) from the theme switcher on login and in the app shell; enable **Use as default when I sign in again** to keep a choice across devices.

See also [Docs/README.md — UI themes](./README.md#ui-themes).