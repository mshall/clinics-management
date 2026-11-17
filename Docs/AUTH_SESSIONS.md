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

## Follow-ups

- Transactional email for reset links in production
- SMS fallback when WhatsApp fails
- Short-lived access tokens (e.g. 15m) with automatic silent refresh in the web app