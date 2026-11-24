-- KX-PT-L1: cross-instance rate limiting (PgRateLimiter, same table shape as Pharmacy / Lab / Kiorex) and a persisted marketplace HMAC nonce store. Additive, idempotent.
CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key", "windowStart")
);
CREATE INDEX IF NOT EXISTS "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

CREATE TABLE IF NOT EXISTS "MarketplaceNonce" (
  "clientId" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceNonce_pkey" PRIMARY KEY ("clientId", "nonce")
);
CREATE INDEX IF NOT EXISTS "MarketplaceNonce_expiresAt_idx" ON "MarketplaceNonce"("expiresAt");
