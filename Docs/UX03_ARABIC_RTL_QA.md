# UX-03 · Arabic RTL & Egyptian copy QA

| Status | Code gates done — native Egyptian copy sign-off is **NH-022** |
|--------|---------------------------------------------------------------|

## Shipped

- **CI missing-key check:** `apps/web/src/lib/ux03-locale-parity.node.test.ts` — every `en.json` leaf key must exist in `ar.json` with a non-empty string; deploy version banner keys (`app.newVersionAvailable`, `app.reloadNow`, `common.later`) must have Arabic copy.
- **Egyptian locales:** `localeForLanguage` / `document.lang` use `ar-EG` / `en-GB` (not Gulf `ar-AE`).
- **Arabic numerals option:** Language menu → Western vs Arabic-Indic digits (`arabic-numerals.ts`, persisted).
- Copy fix: removed hard-coded **درهم** from AR chart string (uses market currency wording).
- Backfill: ~375 UI strings that previously lived only as English `t()` fallbacks (including the “new version available / Reload now” banner) are now in both `en.json` and `ar.json`.

## Human

- Native Egyptian Arabic review of patient-facing WhatsApp/SMS and signup copy — **NH-022**.
