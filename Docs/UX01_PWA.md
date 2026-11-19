# UX-01 · Installable PWA with push and offline today

| Status | Done in code — VAPID keys + iOS Add to Home Screen QA is **NH-021** |
|--------|---------------------------------------------------------------------|

## Shipped

- **Manifest + SW** via `vite-plugin-pwa` in `apps/web/vite.config.ts` (EN name; AR description; NetworkFirst cache `kiorly-today-offline` for today / appointments / patients).
- **Offline today** route `/offline/today` (read-only; uses live dashboard when online, Cache Storage fallback).
- **Install prompt** after onboarding `activatedAt` (`PwaInstallPrompt` in AppShell).
- **API** `POST/GET/DELETE /api/v1/push/subscriptions` + `PushSubscription` model; Kiorex booking creation best-effort notifies the clinician.
- Locales: `pwa.*` in `en.json` / `ar.json`.

## Ops

- Set `WEB_PUSH_VAPID_PUBLIC` / `WEB_PUSH_VAPID_PRIVATE` (and `VITE_WEB_PUSH_VAPID_PUBLIC`) before production push delivery — **NH-021**.
- Install `web-push` in the API workspace when enabling live sends (optional require).
