-- KX-10: daily Kiorex profile views per doctor (pushed by Kiorex)
CREATE TABLE "KiorexProfileViewDaily" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KiorexProfileViewDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KiorexProfileViewDaily_clinicId_clinicianId_day_key" ON "KiorexProfileViewDaily"("clinicId", "clinicianId", "day");
CREATE INDEX "KiorexProfileViewDaily_tenantId_clinicId_day_idx" ON "KiorexProfileViewDaily"("tenantId", "clinicId", "day");

ALTER TABLE "KiorexProfileViewDaily" ADD CONSTRAINT "KiorexProfileViewDaily_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
