-- Kiorly Home sign-in handoff: single-use codes, stored hashed, 30 s lifetime (ADR-038). No credential or token is stored.
CREATE TABLE "HandoffCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "edition" TEXT,
    "origin" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "HandoffCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HandoffCode_codeHash_key" ON "HandoffCode"("codeHash");
CREATE INDEX "HandoffCode_expiresAt_idx" ON "HandoffCode"("expiresAt");
