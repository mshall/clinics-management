-- Back-channel logout replay cache moves from process memory to Postgres so every API instance shares it.
CREATE TABLE "KiorexLogoutTokenSeen" (
    "jti" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KiorexLogoutTokenSeen_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX "KiorexLogoutTokenSeen_expiresAt_idx" ON "KiorexLogoutTokenSeen"("expiresAt");
