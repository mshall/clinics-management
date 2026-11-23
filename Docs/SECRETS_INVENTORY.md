# Secrets inventory (Kiorly Clinic)

Names only. Values never live in git, state or logs. Containers are created by OpenTofu (`infra/tofu`); apps read them through the secrets adapter (`src/platform/adapters/secrets.adapter.ts`).
`scripts/secrets-bootstrap.sh <env>` prints which containers are MISSING / EMPTY / HAS-VALUE.

| Secret (Secrets Manager) | Content | Created by | Populated by | Read by |
|---|---|---|---|---|
| `kiorly-clinic-<env>/jwt` | `{"jwt": "..."}` (also derives the telehealth link-token key, ADR-039) | OpenTofu (`generated_secrets`) | OpenTofu (random) | App Runner instance role |
| `kiorly-clinic-<env>/internal-jobs` | `{"key": "..."}` | OpenTofu | OpenTofu (random) | API + job runner |
| `kiorly-clinic-<env>/home-visit-address-key` | AES-256 key (hex) | OpenTofu | OpenTofu (random) | API (never rotate once data exists) |
| **`/kiorly-clinic/<env>/cloudflare-turn`** (ADR-039) | `{"turnKeyId": "<Cloudflare TURN key uid>", "apiToken": "<TURN key secret>"}` | OpenTofu (`telehealth_turn_secret = true`, explicit-name container, product KMS key, 30-day recovery window) | `scripts/setup-telehealth-turn.sh <env>` (one-time; `--rotate` to replace) | Clinic App Runner instance role ONLY (via `readable_secret_arns`) |

## `/kiorly-clinic/<env>/cloudflare-turn`

- **What it is.** The Cloudflare Realtime TURN key (not a general Cloudflare API token). The API uses it only to call
  `POST https://rtc.live.cloudflare.com/v1/turn/keys/<turnKeyId>/credentials/generate-ice-servers` (`Authorization: Bearer <apiToken>`, body `{"ttl": seconds}`)
  and hands the browsers short-lived ICE servers. Without the secret the API falls back to STUN-only (direct P2P still works; no relay).
- **Setup token (one-time, discard afterwards).** A Cloudflare API token scoped to ONE account with `Account > Realtime (Calls) > Edit` ("Calls Write"; Realtime Admin/Realtime also accepted). No zone permissions. Export `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the shell only.
- **Rotation.** `scripts/setup-telehealth-turn.sh <env> --rotate` creates a new key, stores it, then deletes the old key. Running calls keep their issued credentials until their ttl expires.
- **Runtime wiring.** `TELEHEALTH_TURN_SECRET_NAME` (set by OpenTofu) and `KIORLY_PROVIDER_MODE_TURN=real`; egress must allow `rtc.live.cloudflare.com` (Docs/HB07_EGRESS.md).
