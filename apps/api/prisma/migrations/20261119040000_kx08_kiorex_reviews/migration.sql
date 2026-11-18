-- KX-08: verified Kiorex reviews (synced aggregate + individual reviews with clinic reply)
CREATE TABLE "KiorexRating" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "averageRating" DECIMAL(3,2) NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KiorexRating_clinicId_clinicianId_key" ON "KiorexRating"("clinicId", "clinicianId");
CREATE INDEX "KiorexRating_tenantId_idx" ON "KiorexRating"("tenantId");
ALTER TABLE "KiorexRating" ADD CONSTRAINT "KiorexRating_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "KiorexReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "kiorexReviewId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "moderationStatus" TEXT NOT NULL DEFAULT 'VISIBLE',
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KiorexReview_kiorexReviewId_key" ON "KiorexReview"("kiorexReviewId");
CREATE INDEX "KiorexReview_tenantId_clinicId_clinicianId_reviewedAt_idx" ON "KiorexReview"("tenantId", "clinicId", "clinicianId", "reviewedAt");
ALTER TABLE "KiorexReview" ADD CONSTRAINT "KiorexReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
