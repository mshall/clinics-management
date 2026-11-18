-- CL-04: urology launch specialty + versioned built-in clinical templates
ALTER TYPE "ClinicalSpecialty" ADD VALUE IF NOT EXISTS 'UROLOGY';

ALTER TABLE "ClinicalFormTemplate" ADD COLUMN "systemTemplateVersion" INTEGER;
