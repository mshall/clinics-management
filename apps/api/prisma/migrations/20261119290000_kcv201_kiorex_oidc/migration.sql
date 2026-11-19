-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "kiorexSid" TEXT;

-- CreateTable
CREATE TABLE "KiorexIdentityLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "linkedVia" TEXT NOT NULL,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiorexIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KiorexOidcTransaction" (
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "userId" TEXT,
    "sid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexOidcTransaction_pkey" PRIMARY KEY ("state")
);

-- CreateIndex
CREATE UNIQUE INDEX "KiorexIdentityLink_userId_key" ON "KiorexIdentityLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KiorexIdentityLink_issuer_subject_key" ON "KiorexIdentityLink"("issuer", "subject");

-- CreateIndex
CREATE INDEX "KiorexOidcTransaction_expiresAt_idx" ON "KiorexOidcTransaction"("expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_kiorexSid_idx" ON "UserSession"("kiorexSid");

-- AddForeignKey
ALTER TABLE "KiorexIdentityLink" ADD CONSTRAINT "KiorexIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

