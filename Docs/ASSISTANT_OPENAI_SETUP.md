# AI assistant — OpenAI setup

The in-app assistant **always** answers from **live database data** for allowed topics (clinics, revenue, patient counts, etc.) using the same rules as the REST API.

**OpenAI is optional but recommended** for natural phrasing, follow-up questions, and topics not covered by direct data handlers. Without a key, you still get factual answers for structured questions (e.g. clinic lists, monthly revenue).

## 1. Create an API key

1. Sign up or sign in at [platform.openai.com](https://platform.openai.com).
2. Open **API keys**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
3. **Create new secret key** — copy it once (starts with `sk-…`).
4. Ensure billing is enabled on the account (usage is pay-per-token; `gpt-4o-mini` is the default model).

## 2. Local development

In `apps/api/.env` (gitignored — **never commit**):

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

Restart the API (`npm run dev` from repo root).

## 3. AWS production — **Secrets Manager only**

The CDK stack references Secrets Manager secret **`kiorly-clinics-management/openai-api-key`** (JSON field `apiKey`). App Runner injects `OPENAI_API_KEY` from that secret — **not** from plain environment variables. The first run of the script below creates the secret if the stack output is not deployed yet.

### One-time upload from your machine

Put the key in `apps/api/.env` locally, then run:

```bash
bash scripts/configure-apprunner-openai.sh
```

This script:

1. Writes `{"apiKey":"…"}` to **AWS Secrets Manager**
2. Removes any **plain-text** `OPENAI_API_KEY` on App Runner (if it was set earlier)
3. Ensures App Runner uses the **Secrets Manager reference** (`…:apiKey::`)

After a fresh CDK deploy, run the same script whenever you rotate the key.

### Do not use the AWS Console for plain env vars

In App Runner → Environment variables, **do not** paste the OpenAI key as a plain variable. Use Secrets Manager + the script above (or `aws secretsmanager put-secret-value` on the stack output `OpenAiSecretArn`).

> **Security:** Never commit API keys or paste them in chat. Production keys exist **only** in AWS Secrets Manager (not GitHub, not CDK, not App Runner plain env). CI runs `npm run check:no-openai-secrets-in-git` to block accidental commits.

### Rotate a compromised key

1. In [OpenAI API keys](https://platform.openai.com/api-keys), **revoke** the old key and **create** a new one.
2. Put the new value **only** in gitignored `apps/api/.env` (`OPENAI_API_KEY=…`).
3. Run `bash scripts/configure-apprunner-openai.sh` once (uploads to Secrets Manager; App Runner keeps using the secret reference).
4. Restart local API if you use the assistant in dev.

## 4. Verify

1. Sign in as organization admin.
2. Open the floating assistant.
3. Ask: `What are the list of clinics in this org?`
4. Ask: `What's the revenue for this org for this month?`

Answers should cite **real** clinic names and **posted revenue** for the current calendar month (within your role and clinic scope).

## Permission model

The assistant only loads data you could see in the UI:

- **Revenue / expenses** — requires Revenue, Reports, or Dashboard in your nav (or Doctor revenue for personal physician income).
- **Clinics** — scoped like **Clinics** list API.
- **Admin / HR** topics — require the matching tabs.

Out-of-scope questions get a refusal, not fabricated numbers.
