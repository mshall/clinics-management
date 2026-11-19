-- MN-06 installment payment link + reminder tracking
ALTER TABLE "OperationInstallment" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "OperationInstallment" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
