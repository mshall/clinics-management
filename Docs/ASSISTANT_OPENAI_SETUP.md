# AI assistant — OpenAI setup

The in-app assistant **always** answers from **live database data** for allowed topics (clinics, revenue, patient counts, etc.) using the same rules as the REST API.

**OpenAI is optional but recommended** for natural phrasing, follow-up questions, and topics not covered by direct data handlers. Without a key, you still get factual answers for structured questions (e.g. clinic lists, monthly revenue).

## 1. Create an API key

1. Sign up or sign in at [platform.openai.com](https://platform.openai.com).
2. Open **API keys**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
3. **Create new secret key** — copy it once (starts with `sk-…`).
4. Ensure billing is enabled on the account (usage is pay-per-token; `gpt-4o-mini` is the default model).

## 2. Local development

In `apps/api/.env` (not committed):

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

Restart the API (`npm run dev` from repo root).

## 3. AWS (production App Runner)

After deploy, in **AWS Console → App Runner → your API service → Configuration → Environment variables**, add:

| Name | Value |
|------|--------|
| `OPENAI_API_KEY` | your `sk-…` key |
| `OPENAI_MODEL` | `gpt-4o-mini` (optional) |

Redeploy or apply configuration so the service restarts.

**Or from this repo (reads `apps/api/.env`, does not commit the key):**

```bash
bash scripts/configure-apprunner-openai.sh
```

> **Security:** Never commit API keys or paste them in chat. Add keys only to `apps/api/.env` (gitignored) or App Runner env vars. If a key is exposed, **revoke it** in the OpenAI dashboard and create a new one.

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
