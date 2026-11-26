-- LG-COM-20: additive kind of a CASH tender (CASH | CASH_TRANSFER), its detail and the treatment that priced the charge. All nullable: existing charges are unchanged.
ALTER TABLE "KiorexCommissionCharge" ADD COLUMN "tenderMethod" TEXT;
ALTER TABLE "KiorexCommissionCharge" ADD COLUMN "tenderDetail" TEXT;
ALTER TABLE "KiorexCommissionCharge" ADD COLUMN "rateTreatment" TEXT;
