-- AlterEnum: add ANOTHER_PATIENT after DOCTOR_REFERRAL for "how did they find us"
ALTER TYPE "PatientAcquisitionChannel" ADD VALUE IF NOT EXISTS 'ANOTHER_PATIENT';
