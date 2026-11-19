# Help centre (GT-03)

| | |
|---|---|
| **Status** | **Done** (code) — Arabic video hosting remains NH-007 |
| **Step** | 097 · GT-03 |
| **UI** | `/help` · Help drawer → “Open help centre” |
| **Tests** | `apps/web/src/features/help/gt03-help-centre.node.test.ts` |

## What shipped

- **20 bilingual task articles** answering the top support questions (signup, invite, import, book, check-in/pay, visit note, Rx WhatsApp, deposits, waitlist, cash drawer, refunds/packages, doctor share, Kiorex, upgrade, MFA, export, support access, reports, AI scribe, sample patient).
- **Plan tier filters** (`ALL` / `LITE` / `PRO` / `CLINIC` / `GROUP`) so articles match entitlements.
- **Search** over titles, bodies and tags (EN + AR).
- **Golden-flow Arabic videos** (same five clips as ON-08): listed on `/help` and linked from matching articles; playable when `VITE_HELP_VIDEO_BASE_URL` is set (`<id>-ar.mp4`), otherwise “coming soon”.
- Help drawer links into `/help` (ON-08).

## Needs human

- Record/host the five 60-second Arabic videos and set `VITE_HELP_VIDEO_BASE_URL` — see NH-007 in `Docs/KIORLY_NEEDS_HUMAN.md`.
