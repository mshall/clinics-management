# Kiorly UI design catalog

Product design directions live beside the shipped app themes. Use this folder for **prototypes, tokens, and reference boards** — not runtime code (except optional starter kits copied into `apps/web` during implementation).

| ID | Name | Status | Location |
|----|------|--------|----------|
| `default` | **Kiorly Default** (Light / Dark) | Shipped in `apps/web` | `data-theme="default-*"` — see [UI design directions](../Docs/UI_DESIGN_DIRECTIONS.md#kiorly-default) |
| `material` | **Material Design 3** (Light / Dark) | Shipped in `apps/web` | `apps/web/src/styles/material-theme.css` |
| `clinical-os` | **Kiorly Clinical OS** | Shipped theme + Screen Explorer (Nov 2026) | [`clinical-os/`](./clinical-os/) · `apps/web/src/styles/clinical-os-theme.css` |

## Kiorly Clinical OS

**Kiorly Clinical OS** is the interactive **Screen Explorer** prototype: a single-page HTML app that walks every major route group (overview, clinical, operations, admin, platform) with light/dark mode, collapsible sidebar, and mobile bottom nav. Companion **implementation assets** (tokens, branding, Lucide registry, example React primitives) sit under `clinical-os/implementation-assets/`.

**Open locally:**

```bash
npm run design:clinical-os
# or: open Design/clinical-os/screen-explorer.html
```

Canonical write-up: [Docs/UI_DESIGN_DIRECTIONS.md](../Docs/UI_DESIGN_DIRECTIONS.md).