-- KX-03: per-doctor daily marketplace booking cap on availability template
ALTER TABLE "ClinicianAvailabilityTemplate" ADD COLUMN "marketplaceDailyCap" INTEGER NOT NULL DEFAULT 20;