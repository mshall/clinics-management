-- Point Egypt market AI config at EU OpenAI API host (set OPENAI_API_KEY for the matching tenant/org secret).

UPDATE "Market"
SET "providerConfig" = COALESCE("providerConfig", '{}'::jsonb) || '{
  "ai": {
    "key": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://eu.api.openai.com/v1",
    "model": "gpt-4o-mini",
    "secretRef": "env:OPENAI_API_KEY",
    "promptVersion": "v1",
    "dataResidencyNote": "Use an OpenAI account/endpoint with EU data residency; identifiers are redacted before prompts."
  }
}'::jsonb
WHERE "id" = 'market-egypt';