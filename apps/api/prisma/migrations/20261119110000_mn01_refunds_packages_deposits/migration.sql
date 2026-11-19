-- AlterTable
ALTER TABLE "PatientServicePackage" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "soldByUserId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "PatientPackageConsumption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "revenueEntryId" TEXT,
    "consumedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPackageConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "direction" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "cashierUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRefund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "paymentId" TEXT,
    "revenueEntryId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reversalRevenueEntryId" TEXT,
    "cashMovementId" TEXT,
    "creditNoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientDeposit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CLINIC',
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "revenueEntryId" TEXT,
    "paymentId" TEXT,
    "createdByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientPackageConsumption_revenueEntryId_key" ON "PatientPackageConsumption"("revenueEntryId");

-- CreateIndex
CREATE INDEX "PatientPackageConsumption_tenantId_packageId_idx" ON "PatientPackageConsumption"("tenantId", "packageId");

-- CreateIndex
CREATE INDEX "PatientPackageConsumption_appointmentId_idx" ON "PatientPackageConsumption"("appointmentId");

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_clinicId_createdAt_idx" ON "CashMovement"("tenantId", "clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_sourceType_sourceId_idx" ON "CashMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRefund_reversalRevenueEntryId_key" ON "BillingRefund"("reversalRevenueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRefund_cashMovementId_key" ON "BillingRefund"("cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRefund_creditNoteId_key" ON "BillingRefund"("creditNoteId");

-- CreateIndex
CREATE INDEX "BillingRefund_tenantId_clinicId_createdAt_idx" ON "BillingRefund"("tenantId", "clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingRefund_tenantId_status_idx" ON "BillingRefund"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BillingRefund_patientId_idx" ON "BillingRefund"("patientId");

-- CreateIndex
CREATE INDEX "BillingRefund_paymentId_idx" ON "BillingRefund"("paymentId");

-- CreateIndex
CREATE INDEX "BillingRefund_revenueEntryId_idx" ON "BillingRefund"("revenueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeposit_revenueEntryId_key" ON "PatientDeposit"("revenueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientDeposit_paymentId_key" ON "PatientDeposit"("paymentId");

-- CreateIndex
CREATE INDEX "PatientDeposit_tenantId_patientId_idx" ON "PatientDeposit"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PatientDeposit_tenantId_clinicId_status_idx" ON "PatientDeposit"("tenantId", "clinicId", "status");

-- CreateIndex
CREATE INDEX "PatientDeposit_appointmentId_idx" ON "PatientDeposit"("appointmentId");

-- CreateIndex
CREATE INDEX "AiScribeSession_tenantId_encounterId_idx" ON "AiScribeSession"("tenantId", "encounterId");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_clinicId_createdAt_idx" ON "BillingPayment"("tenantId", "clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPayment_patientId_idx" ON "BillingPayment"("patientId");

-- CreateIndex
CREATE INDEX "BillingPaymentAllocation_paymentId_idx" ON "BillingPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "CashierShiftClose_tenantId_clinicId_shiftDate_idx" ON "CashierShiftClose"("tenantId", "clinicId", "shiftDate");

-- CreateIndex
CREATE INDEX "ClinicalIncident_tenantId_clinicId_idx" ON "ClinicalIncident"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_active_idx" ON "CommissionRule"("tenantId", "active");

-- CreateIndex
CREATE INDEX "ContractServicePrice_payerCompanyId_catalogItemId_idx" ON "ContractServicePrice"("payerCompanyId", "catalogItemId");

-- CreateIndex
CREATE INDEX "ContractServicePrice_tenantId_idx" ON "ContractServicePrice"("tenantId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_clinicId_idx" ON "CreditNote"("tenantId", "clinicId");

-- CreateIndex
CREATE INDEX "CreditNote_patientId_idx" ON "CreditNote"("patientId");

-- CreateIndex
CREATE INDEX "FiscalSubmission_tenantId_clinicId_status_idx" ON "FiscalSubmission"("tenantId", "clinicId", "status");

-- CreateIndex
CREATE INDEX "InvoiceLine_serviceCatalogItemId_idx" ON "InvoiceLine"("serviceCatalogItemId");

-- CreateIndex
CREATE INDEX "OperationInstallment_operationId_idx" ON "OperationInstallment"("operationId");

-- CreateIndex
CREATE INDEX "OperationInstallment_tenantId_dueOn_idx" ON "OperationInstallment"("tenantId", "dueOn");

-- CreateIndex
CREATE INDEX "OperationPreOpCheckItem_operationId_idx" ON "OperationPreOpCheckItem"("operationId");

-- CreateIndex
CREATE INDEX "OperationPreOpCheckItem_tenantId_idx" ON "OperationPreOpCheckItem"("tenantId");

-- CreateIndex
CREATE INDEX "OperationSupplyUsed_operationId_idx" ON "OperationSupplyUsed"("operationId");

-- CreateIndex
CREATE INDEX "OperationSupplyUsed_tenantId_idx" ON "OperationSupplyUsed"("tenantId");

-- CreateIndex
CREATE INDEX "OutboundMessage_tenantId_status_idx" ON "OutboundMessage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PatientDataProtectionConsent_tenantId_patientId_idx" ON "PatientDataProtectionConsent"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PatientServicePackage_tenantId_patientId_idx" ON "PatientServicePackage"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PayerPreAuthorization_tenantId_patientId_idx" ON "PayerPreAuthorization"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PayerPreAuthorization_payerCompanyId_idx" ON "PayerPreAuthorization"("payerCompanyId");

-- CreateIndex
CREATE INDEX "RecallCampaign_tenantId_kind_idx" ON "RecallCampaign"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "SatisfactionSurveyResponse_tenantId_clinicianId_idx" ON "SatisfactionSurveyResponse"("tenantId", "clinicianId");

-- CreateIndex
CREATE INDEX "ServicePrice_tenantId_idx" ON "ServicePrice"("tenantId");

-- AddForeignKey
ALTER TABLE "PatientPackageConsumption" ADD CONSTRAINT "PatientPackageConsumption_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PatientServicePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "FiscalSubmission_tenantId_clinicId_providerKey_deviceId_status_" RENAME TO "FiscalSubmission_tenantId_clinicId_providerKey_deviceId_sta_idx";
