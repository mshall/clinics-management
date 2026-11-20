-- AlterTable
ALTER TABLE "CarePlan" ADD COLUMN     "requestRef" TEXT;

-- AlterTable
ALTER TABLE "KiorexCommissionRate" ADD COLUMN     "profession" "Profession",
ADD COLUMN     "serviceLocation" "ServiceLocation";

-- CreateIndex
CREATE UNIQUE INDEX "CarePlan_requestRef_key" ON "CarePlan"("requestRef");

