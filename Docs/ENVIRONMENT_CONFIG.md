# Environment configuration: CORS, hosts and Passport (ADR-059)

Everything here is OFF or neutral by default. A deployment that sets none of these variables behaves exactly as before (the live AWS Clinic with the real organisation included). Values for a deployed environment come from the workspace registry (`_docs/registry/service-url-registry.yaml`, `node _docs/registry/validate-registry.mjs --emit env|cors --env <id>`); never type a host into code.

## 1. CORS allow-list (`CORS_ALLOWED_ORIGINS`)

Implemented in `apps/api/src/common/cors-policy.ts`, wired in `main.ts`. The API is bearer-token only (no cookies, `credentials: false`).

| Situation | Behaviour |
|---|---|
| Request is same-origin (Origin equals the host it was addressed to, via `X-Forwarded-Host`/`Host`) | Always allowed (browsers need no CORS header for it anyway) |
| Variable **unset**, non-production | Reflect any Origin (local development, as before) |
| Variable **unset**, production | **LEGACY MODE**: reflect any Origin exactly as before, one startup warning `[cors] ... LEGACY MODE`. This is how the already-deployed CloudFront origin, native apps and the third-party booking widget keep working with no deploy-time change. No host is written in code. |
| Variable set | Allow-list of its origins, plus the origins of `APP_WEB_URL`, `WEB_PUBLIC_ORIGIN`, `NURSE_WEB_URL` (so the deployed web origin is reachable through existing config only) |
| Variable `*` | Reflect any Origin, **outside production only** (local development). In production `*` is ignored and reported |
| Production, variable set but empty or with no valid origin | **Fails closed**: no cross-origin request is allowed (same-origin and the configured web origins only). Production accepts only bare `https` origins (no path, no `http`) |

**Follow-up at deploy time (not done here):** set `CORS_ALLOWED_ORIGINS` on the Clinic service to leave legacy mode. For the existing test plane the registry emits it: `node _docs/registry/validate-registry.mjs --emit cors --env test` (line `kiorly.api`), which includes the legacy CloudFront origin through the registry `legacy_hosts`. Because the web is served same-origin behind that distribution, setting it does not change what the real organisation sees; keep `WEB_PUBLIC_ORIGIN` (or `APP_WEB_URL`) set to the CloudFront origin so it is allowed even if the list is edited wrongly. Roll back by unsetting the variable (back to legacy mode).

## 2. Host literals

All runtime host defaults live in `apps/api/src/config/host-config.ts` (API) and `apps/web/src/lib/host-config.ts` (web). Defaults equal the previous literals. `apps/api/src/config/host-literals.node.test.ts` fails when a Kiorex/Kiorly/cloudfront host appears in runtime code outside those files (and a short, justified allow-list).

| Variable | Replaces default | Used by |
|---|---|---|
| `WEB_PUBLIC_ORIGIN` | `https://<app host>` | referral links, brand host |
| `WEB_BASE_URL` | `https://<app host>` | pay links |
| `NURSE_WEB_URL` | `nurse.<legacy domain>` | Nurse edition host detection, brand, Passport nurse redirect |
| `NURSE_PARENT_DOMAINS` (comma list) | `kiorly.com,kiorly.link` | `nurse.<env>.<domain>` host detection |
| `KIOREX_WIDGET_BASE_URL` | booking widget host | widget embed snippets |
| `DEMO_EMAIL_DOMAIN` | `kiorly.com` | demo e-mail to `@demo.clinic` sign-in aliasing |
| `PILOT_EMAIL_DOMAIN` | `pilot.kiorly.com` | staging pilot tenant seed e-mails |
| `EMAIL_SENDING_DOMAIN` | `mail.kiorly.com` | default sender / SES sending domain (`EMAIL_FROM_ADDRESS` still wins) |
| `NOREPLY_ADDRESS` | `noreply@kiorly.com` | PSP fallback payer e-mail |
| `OPS_CONTACT_ADDRESS` | `ops@kiorly.com` | Web Push VAPID subject (`WEB_PUSH_VAPID_SUBJECT` still wins) |
| web build: `VITE_NURSE_WEB_HOST`, `VITE_NURSE_PARENT_DOMAINS`, `VITE_CONTACT_EMAIL` | legacy values | edition detection, marketing page |

The frozen event schema identifier (`https://schemas...`) stays in `host-config.ts`: it is a contract identifier, not a deployment host.

## 3. Passport (Kiorex sign-in)

Already implemented (KCV-201, ADR-038/-031): auth code + PKCE, back-channel logout, per-organisation default sign-in method (`Tenant.defaultSignInMethod`, null = automatic, PASSWORD for an organisation not linked to Kiorex). Nothing about the default changes: it stays PASSWORD until an owner or admin chooses Passport.

| Variable | Notes |
|---|---|
| `KIOREX_OIDC_ISSUER` | Passport issuer (registry `{issuer}`). Unset = Passport off |
| `KIOREX_OIDC_CLIENT_ID` | default `kiorly-clinic` |
| `KIOREX_OIDC_CLIENT_SECRET` | **by reference**: injected from the secret store (App Runner `runtimeEnvironmentSecrets`, path `/clinic/<env>/oidc-client-secret`); required in production; same value as `clientSecret` in Passport's override |
| `KIOREX_OIDC_REDIRECT_URI` | default `<APP_WEB_URL or WEB_PUBLIC_ORIGIN>/auth/kiorex/callback` |
| `KIOREX_OIDC_REDIRECT_URI_NURSE` | default `<NURSE_WEB_URL>/auth/kiorex/callback` |
| `KIOREX_OIDC_POST_LOGOUT_REDIRECT_URI` | default `<web origin>/` |
| `KIOREX_OIDC_BACKCHANNEL_LOGOUT_URI` | what Passport calls; default `<web origin>/api/v1/auth/kiorex/backchannel-logout` (informational on the Clinic side, registered in Passport) |
| `SIGNIN_DEFAULT_METHOD` | deployment default for an unknown organisation, `PASSWORD` when unset |

Production has **no localhost default**: if the web origin (`APP_WEB_URL` / `WEB_PUBLIC_ORIGIN` / `KIOREX_OIDC_REDIRECT_URI`) or the secret is missing, Passport stays OFF and the API logs `[passport] ... missing: <variable names>` at boot. The login page then offers the password only.

### Passport side: `KX_CLIENT_OVERRIDES_JSON` (kiorex-account, `Docs/DEPLOY_DEV.md`)

The `kiorly-clinic` client is already registered there (one client for Clinic and Nurse). To let a kx-test Passport serve this Clinic set, on Passport:

```
KX_CLIENT_OVERRIDES_JSON={
  "kiorly-clinic": {
    "redirectUris": ["https://<clinic host>/auth/kiorex/callback", "https://<nurse host>/auth/kiorex/callback"],
    "postLogoutRedirectUris": ["https://<clinic host>/"],
    "backchannelLogoutUri": "https://<clinic host>/api/v1/auth/kiorex/backchannel-logout",
    "clientSecret": "<same 32+ character value as KIOREX_OIDC_CLIENT_SECRET, from the secret store>"
  }
}
```

Hosts are the registry values (`kiorly.clinics`, `kiorly.nurse`); with the live same-origin distribution the API path is `/api/v1/...` on the clinic host (behind the planned gateway it is `/clinics/api/v1/...`, registry `oidc_clients[kiorly-clinic].backchannel_path`). `passportClientOverride(env)` in `apps/api/src/auth/kiorex-oidc.port.ts` builds exactly this object from the Clinic's own env (secret as a placeholder), so the two sides cannot drift. Enabling Passport for an organisation is then an admin action (Administration, default sign-in method); no existing organisation changes by itself.

## 4. Deployed wiring from the CDK stack (kx-test, 27 Nov 2026)

The live App Runner service and its CloudFront distribution belong to the CDK stack, so a manual change to its environment is undone by the next deploy. The stack therefore reads `infra/config/kx-test.json` (`infra/src/env-wiring.ts`): plain values (hosts, CORS list; generated by `node _docs/registry/emit-clinic-config.mjs --env test` in the workspace from the URL registry, never typed by hand) become App Runner environment variables, and every secret is a REFERENCE (Secrets Manager name `/kx/test/clinic` plus JSON key) passed as `runtimeEnvironmentSecrets`; the instance role gets read access to exactly those secrets. The loader refuses reserved names (database, runtime, JWT, OpenAI), secret-looking plain values, localhost and `http` URLs, so a bad file stops the deploy instead of half-applying. No file, no change.

`/kx/test/clinic` keys: `KIOREX_OIDC_CLIENT_SECRET` (same value as the `kiorly-clinic` client in Passport), `KIOREX_OUTBOX_WEBHOOK_SECRET` (the platform's webhook secret), `KIOREX_MARKETPLACE_CLIENT_KEY` and `KIOREX_MARKETPLACE_CLIENT_SECRET` (the pair the platform signs marketplace requests with).

**Marketplace client registration.** There is no admin screen for the platform's `PlatformIntegrationClient`. When BOTH `KIOREX_MARKETPLACE_CLIENT_KEY` and `KIOREX_MARKETPLACE_CLIENT_SECRET` are set, `MarketplaceClientBootstrapService` creates that client (scope MARKETPLACE) at boot, replaces the stored hash when the secret changed, never reactivates a deactivated client and never fails the boot. Off when either is unset.

**Outbound internet.** The Clinic VPC has no NAT, so the API could not reach Passport or the Kiorex API; the NAT gateway and the default routes are managed outside the CDK stack in `infra/tofu` of the workspace (module `clinic_link`).

**Two hosts, one service.** `https://clinics.test.kiorly.com` (a second CloudFront distribution that serves the SPA through the legacy distribution and sends `/api/*` and `/marketplace/*` to the same App Runner origin) and the legacy `https://d92iz83i79c05.cloudfront.net` both work. Passport redirects always return to `APP_WEB_URL`; both callbacks are registered in Passport. An organisation keeps its own default sign-in method (PASSWORD until an admin switches it).
