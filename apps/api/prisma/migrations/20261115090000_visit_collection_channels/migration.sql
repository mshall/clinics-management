-- CreateEnum
CREATE TYPE "VisitCollectionMode" AS ENUM ('CASH_ON_VISIT', 'MONEY_TRANSFER');

-- CreateEnum
CREATE TYPE "MoneyTransferChannel" AS ENUM ('INSTAPAY', 'FAWRY');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "checkInCollectionMode" "VisitCollectionMode",
ADD COLUMN     "checkInTransferChannel" "MoneyTransferChannel",
ADD COLUMN     "checkInTransferReference" TEXT;

-- AlterTable
ALTER TABLE "RevenueEntry" ADD COLUMN     "collectionMode" "VisitCollectionMode",
ADD COLUMN     "transferChannel" "MoneyTransferChannel",
ADD COLUMN     "transferReference" TEXT;