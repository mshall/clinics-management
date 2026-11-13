-- CreateEnum
CREATE TYPE "ClinicalSpecialty" AS ENUM ('POLYCLINIC', 'GENERAL_MEDICINE', 'PAIN_MANAGEMENT', 'ORTHOPEDICS', 'PEDIATRICS', 'DERMATOLOGY', 'DENTISTRY', 'PHYSIO_THERAPY', 'AESTHETICS', 'CARDIOLOGY', 'OBSTETRICS_GYNECOLOGY', 'ENT', 'OPHTHALMOLOGY', 'PSYCHIATRY', 'RADIOLOGY', 'LABORATORY', 'INTERNAL_MEDICINE', 'FAMILY_MEDICINE');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "clinicalSpecialty" "ClinicalSpecialty" NOT NULL DEFAULT 'POLYCLINIC',
ADD COLUMN     "taxRegistrationNumber" TEXT,
ADD COLUMN     "invoiceVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "clinicalSpecialty" "ClinicalSpecialty",
ADD COLUMN     "commissionPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "clinicTaxRegistrationNumber" TEXT,
ADD COLUMN     "vatPercentSnapshot" DECIMAL(5,2) NOT NULL DEFAULT 5;
