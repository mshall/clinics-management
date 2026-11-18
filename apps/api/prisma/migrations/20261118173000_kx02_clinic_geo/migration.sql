-- KX-02: clinic coordinates for Kiorex provider profiles

ALTER TABLE "Clinic" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "Clinic" ADD COLUMN "longitude" DECIMAL(10,7);