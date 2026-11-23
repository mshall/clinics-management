-- Additive: arrival-vs-address distance on a home visit (non-blocking off-site flag for the dispatcher).
ALTER TABLE "HomeVisit" ADD COLUMN "arrivalDistanceM" INTEGER;
ALTER TABLE "HomeVisit" ADD COLUMN "arrivedOffSite" BOOLEAN NOT NULL DEFAULT false;
