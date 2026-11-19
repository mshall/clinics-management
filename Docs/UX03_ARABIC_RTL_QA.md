# UX-03 · Arabic RTL & Egyptian copy QA

| Status | Code gates done — native Egyptian copy sign-off is **NH-022** |
|--------|---------------------------------------------------------------|

## Shipped

- **CI missing-key check:** `apps/web/src/lib/ux03-locale-parity.node.test.ts` — every `en.json` leaf key must exist in `ar.json` with a non-empty string.
- **Egyptian locales:** `localeForLanguage` / `document.lang` use `ar-EG` / `en-GB` (not Gulf `ar-AE`).
- **Arabic numerals option:** Language menu → Western vs Arabic-Indic digits (`arabic-numerals.ts`, persisted).
- Copy fix: removed hard-coded **درهم** from AR chart string (uses market currency wording).

## Human

- Native Egyptian Arabic review of patient-facing WhatsApp/SMS and signup copy — **NH-022**.
