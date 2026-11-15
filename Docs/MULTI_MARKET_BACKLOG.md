# Multi-market backlog

Items intentionally deferred while Egypt (EG) is the only live market.

| Area | Current state | Target |
|------|----------------|--------|
| Fiscal provider settings | `eta*` columns on Clinic/Tenant; `clinicOverrides` in queue | Per-clinic JSON keyed by provider + `settingsSchema` validation |
| Payment channels | `MoneyTransferChannel` enum (`INSTAPAY` \| `FAWRY`) | String channel ids from `Market.paymentMethods` + reference format rules |
| Market defaults | Prisma defaults EGP, Africa/Cairo, weekend [5,6] | Required market fields; no silent Egypt fallback |
| Translations | `Locale` enum + `*En`/`*Ar` columns | `Market.translations` driving content (when market #2 launches) |

Fiscal idempotency and MFA for privileged roles are implemented; ETA submit uses per-clinic `ProviderCredential.secretRef` when present.