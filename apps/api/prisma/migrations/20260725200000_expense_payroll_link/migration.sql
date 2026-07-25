ALTER TABLE "Expense" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "payrollMonth" TEXT;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Expense_tenantId_employeeId_payrollMonth_key" ON "Expense"("tenantId", "employeeId", "payrollMonth");
CREATE INDEX "Expense_tenantId_payrollMonth_idx" ON "Expense"("tenantId", "payrollMonth");
