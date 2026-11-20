-- CreateEnum
CREATE TYPE "MobileDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "MobileDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" "MobileDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionId" TEXT,
    "pushToken" TEXT,
    "pushProvider" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobilePush" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "MobilePush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileAlertAck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "ackedBy" TEXT NOT NULL,
    "note" TEXT,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileAlertAck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileResultReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileResultReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MobileDevice_tenantId_status_idx" ON "MobileDevice"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MobileDevice_userId_deviceId_key" ON "MobileDevice"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "MobilePush_userId_createdAt_idx" ON "MobilePush"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MobilePush_tenantId_userId_readAt_idx" ON "MobilePush"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "MobileAlertAck_tenantId_alertKey_key" ON "MobileAlertAck"("tenantId", "alertKey");

-- CreateIndex
CREATE UNIQUE INDEX "MobileResultReview_tenantId_orderId_key" ON "MobileResultReview"("tenantId", "orderId");

-- CreateIndex

-- CreateIndex

