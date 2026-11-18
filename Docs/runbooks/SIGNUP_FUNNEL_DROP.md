# Signup funnel drop (SIGNUP_FUNNEL_DROP)

## Symptoms

- On-call alert **SIGNUP_FUNNEL_DROP** (≥10 consumed OTPs, &lt;50% `SIGNUP_COMPLETED` in 24h)
- Spike in abandoned signups after OTP verify
- Errors on `POST /api/v1/signup/complete`

## First actions

1. Check API error rate on signup routes (validation, legal pack, disposable email).
2. Verify market operability, plan prices seeded, and legal acceptance gates (GT-02).
3. Review WhatsApp OTP delivery (correlate with WHATSAPP runbook if OTP channel fails).
4. Test one full signup in staging with `SIGNUP_OTP_DEV_CODE`.

## Escalation

- **L2:** Onboarding engineer — DB constraint or provision transaction failures.
- **Growth:** Pause paid ads until funnel recovers.