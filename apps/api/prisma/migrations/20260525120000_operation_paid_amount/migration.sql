-- Track cumulative payments against operation total cost

ALTER TABLE "Operation" ADD COLUMN "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "Operation"
SET "paidAmount" = CASE
  WHEN "status" = 'COMPLETED' THEN "totalCost"
  ELSE "downPayment"
END;
