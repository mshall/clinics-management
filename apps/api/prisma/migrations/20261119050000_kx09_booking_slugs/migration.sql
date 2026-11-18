-- KX-09: clinic-branded booking page slugs (commission-free CLINIC_LINK bookings)
ALTER TABLE "Clinic" ADD COLUMN "bookingSlug" TEXT;
ALTER TABLE "MarketplaceListing" ADD COLUMN "bookingSlug" TEXT;

CREATE UNIQUE INDEX "Clinic_bookingSlug_key" ON "Clinic"("bookingSlug");
CREATE UNIQUE INDEX "MarketplaceListing_bookingSlug_key" ON "MarketplaceListing"("bookingSlug");
