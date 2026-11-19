# Authentication sessions & password recovery (ON-02)

| Item | Status |
|------|--------|
| ON-02 Password reset, OTP login, sessions | **Done** |
| Email delivery provider (production) | **Follow-up** |

## Password recovery

- `POST /api/v1/auth/password/forgot` — `{ email }` creates a 30-minute single-use token (link logged in dev; set `AUTH_RESET_DEV_EXPOSE=1` to return `devResetLink` locally) or `{ phone }` sends WhatsApp OTP (`PASSWORD_RESET` purpose).
- `POST /api/v1/auth/password/reset` — `{ token, newPassword }` or `{ phone, code, newPassword }`.
- All active sessions are revoked after a successful reset; unused reset tokens for that user are consumed.

## Phone login (physicians)

- `POST /api/v1/auth/otp/request` / `otp/verify` — matches employee phone to a user with physician role; MFA still required when enabled (pass `mfaCode` on verify).

## Sessions

- Login, OTP verify, and signup complete return `accessToken`, `refreshToken`, and `sessionId`.
- Access JWT includes `sid`; revoked sessions invalidate the access token.
- `POST /api/v1/auth/refresh` — refresh-token rotation (30-day lifetime, prior refresh invalidated).
- `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id`, `POST /api/v1/auth/sessions/revoke-all`.

## Rate limits

Shared with signup OTP: 5 sends / phone / hour, 20 / IP / hour, 5 verify attempts per challenge. Dev OTP: `SIGNUP_OTP_DEV_CODE`.

## Sign in with Kiorex Passport (KCV-201)

Optional OIDC login **alongside** email/password and phone OTP (`KX-04` phase 2). Enabled only when
`KIOREX_OIDC_ISSUER` is set (plus `KIOREX_OIDC_CLIENT_SECRET` in production; dev default `dev-kiorly-clinic-secret`);
unset ⇒ the button is hidden and nothing changes. Also hidden when Kiorex flag `account.provider_sso` is OFF globally.
Implemented with `openid-client` (auth code + PKCE S256, confidential client `kiorly-clinic`, state + nonce) and `jose` (logout token verification); no custom crypto.

| Endpoint | Purpose |
|----------|---------|
| `GET /auth/kiorex/config` | `{ enabled }` — drives the login button |
| `POST /auth/kiorex/start` | returns the authorization URL (transaction stored server-side) |
| `POST /auth/kiorex/callback` | `{code,state}` → `SESSION` / `MFA_REQUIRED` (ticket) / `LINK_REQUIRED` / `LINKED` |
| `POST /auth/kiorex/complete` | `{ticket,mfaCode}` — TOTP/WhatsApp/recovery step-up (SC-04) |
| `GET /auth/kiorex/link`, `POST /auth/kiorex/link/start`, `POST /auth/kiorex/link/remove` | explicit link/unlink; **password re-authentication** required |
| `POST /auth/kiorex/backchannel-logout` | OIDC Back-Channel Logout (`logout_token`, form-encoded) |

- **Never auto-merge.** An unknown Kiorex subject gets `LINK_REQUIRED`; linking only happens from an authenticated Kiorly session after the user re-enters their Kiorly password (`KiorexIdentityLink`, unique per user and per issuer+subject, audited `KIOREX_IDENTITY_LINKED`).
- **Authorization stays in Kiorly** (roles, clinic grants, money visibility). MFA users must still pass the step-up code; a Kiorex session alone never unlocks privileged roles.
- **Back-channel logout** verifies issuer/audience/`typ=logout+jwt`/RS256 against the issuer JWKS, de-duplicates `jti`, revokes sessions bound to `sid` (`UserSession.kiorexSid`) or all sessions of the linked subject; `subject.deleted` also removes the link.
- Local IdP: `kiorex-account` dev OIDC on `http://localhost:4400`, redirect `http://localhost:5173/auth/kiorex/callback`, back-channel URI `http://localhost:3000/api/v1/auth/kiorex/backchannel-logout`.
- Tests: `auth/kcv201-kiorex-oidc.integration.test.ts`.

## Follow-ups

- Transactional email for reset links in production
- SMS fallback when WhatsApp fails
- Short-lived access tokens (e.g. 15m) with automatic silent refresh in the web app
