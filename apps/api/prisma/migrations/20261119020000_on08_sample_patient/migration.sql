-- ON-08: sample ("try it") patient flag
ALTER TABLE "Patient" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
