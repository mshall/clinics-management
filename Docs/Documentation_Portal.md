# Documentation portal

The **docs** workspace is a separate module in this monorepo. It renders Kiorly project markdown and synced **PiggyMetrics** reference documentation in a local browser UI.

**Doc set version:** PRD **v1.8** · RFC **v1.7** (aligned with `main`, July 2026).

---

## Quick start

From the **repository root**:

```bash
npm install
npm run docs:sync      # pull PiggyMetrics README from GitHub master
npm run docs:dev       # start portal at http://localhost:5175
```

Build a static site for offline sharing or CI artifacts:

```bash
npm run docs:build
npm run docs:preview   # http://localhost:4175
```

---

## What the portal includes

| Section | Source | Description |
|---------|--------|-------------|
| **Project docs** | `Docs/*.md` | PRD, RFC, test users, AWS guide, this page |
| **Architecture comparison** | `apps/docs/content/architecture-comparison.md` | Kiorly monolith ↔ PiggyMetrics microservices mapping |
| **PiggyMetrics (synced)** | `apps/docs/content/piggymetrics/README.md` | Upstream README from [`sqshq/PiggyMetrics`](https://github.com/sqshq/PiggyMetrics) `master` |

The portal does **not** run PiggyMetrics services — it only syncs and displays upstream documentation for architecture learning and onboarding.

---

## Sync PiggyMetrics master

```bash
npm run docs:sync
# equivalent: npm run sync:piggymetrics -w docs
# or: bash scripts/sync-piggymetrics-docs.sh
```

This script:

1. Downloads `README.md` from `https://github.com/sqshq/PiggyMetrics/raw/master/README.md`
2. Writes `apps/docs/content/piggymetrics/SYNC.json` with commit SHA and sync time
3. Should be run before release notes or when refreshing reference material

Commit the updated files after sync so teammates and CI see the same snapshot.

---

## Module layout

```
apps/docs/                    # Vite + React documentation portal (port 5175)
  content/
    architecture-comparison.md
    piggymetrics/
      README.md               # synced from upstream
      SYNC.json               # sync metadata
  src/                        # portal UI
scripts/
  sync-piggymetrics-docs.sh   # upstream sync script
Docs/                         # canonical Kiorly markdown (also rendered in portal)
```

Root `package.json` scripts:

| Script | Action |
|--------|--------|
| `docs:dev` | Dev server for portal |
| `docs:build` | Production static build |
| `docs:preview` | Preview built site |
| `docs:sync` | Refresh PiggyMetrics README |

---

## Relationship to the live app

| App | Port | Purpose |
|-----|------|---------|
| **API** (`apps/api`) | 3000 | NestJS REST backend |
| **Web** (`apps/web`) | 5173 / 5174 | Clinic management SPA |
| **Docs** (`apps/docs`) | 5175 | Documentation portal (this module) |

Run `npm run dev` for API + web; run `npm run docs:dev` separately when reading or editing documentation.

---

## Editing project docs

1. Edit markdown under `Docs/` (source of truth).
2. Refresh the portal tab — Vite hot-reloads linked files.
3. Update PRD/RFC version lines in `Docs/README.md` when shipping features.

See also the root [`README.md`](../README.md) **Documentation** section.
