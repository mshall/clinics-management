-- AI assistant feature flag + Egypt market AiProvider config

INSERT INTO "FeatureFlag" ("id", "key", "enabled", "description", "updatedAt") VALUES
    ('ff-ai-assistant', 'ai_assistant', true, 'In-product AI assistant via market-configured AiProvider', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "MarketFeatureFlag" ("id", "marketId", "key", "enabled", "description", "createdAt", "updatedAt") VALUES
    ('mff-eg-ai', 'market-egypt', 'ai_assistant', true, 'AI assistant for Egypt market', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("marketId", "key") DO NOTHING;

UPDATE "Market"
SET "providerConfig" = COALESCE("providerConfig", '{}'::jsonb) || '{
  "ai": {
    "key": "openai-compatible",
    "enabled": true,
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "secretRef": "env:OPENAI_API_KEY",
    "promptVersion": "v1"
  }
}'::jsonb
WHERE "id" = 'market-egypt';