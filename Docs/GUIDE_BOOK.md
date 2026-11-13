# In-app Guide book

Role-based user onboarding lives in the web app, not only in markdown.

## Access

| Item | Detail |
|------|--------|
| **Nav** | Bottom of the sidebar — **Guide book** (EN) / **كتيب التعليمات** (AR) |
| **Route** | `/guide` (any signed-in user; not gated by custom nav-tab grants) |
| **Language** | Follows app language (EN/AR); role labels use existing locale formatters |
| **Locales** | `apps/web/src/locales/en.json` and `ar.json` are kept in parity (same key set); dashboard “Today (live)” and front-desk strings included |

## Behaviour

- Content is selected from `ROLE_GUIDES` in `apps/web/src/features/guide/role-guide-content.ts` using the logged-in user’s role (`mapApiRole`).
- All organization roles are covered: platform super admin, group admin/supervisor, branch manager, finance, HR, clinic admin/assistant, physician, nurse, receptionist, call center.
- Each guide includes workflow sections, numbered steps, optional **Open in app** deep links, and pro tips where relevant.

## Maintaining content

When shipping a new nav area or workflow:

1. Update the matching role block in `role-guide-content.ts` (EN + AR).
2. Add quick links in `RoleQuickLinks` in `guide-book-page.tsx` if it is a primary entry point for that role.
3. Link to this file or `CLINIC_PLATFORM_CAPABILITIES.md` from the guide footer for technical depth.

## Related

- [FRONT_DESK.md](./FRONT_DESK.md)
- [CLINICAL_WORKFLOW.md](./CLINICAL_WORKFLOW.md)
- [Test_Data_Users.md](./Test_Data_Users.md) — demo roles for verifying each guide
