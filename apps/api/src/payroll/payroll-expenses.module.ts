import { Module } from "@nestjs/common";
import { PayrollExpensesService } from "./payroll-expenses.service";

@Module({
  providers: [PayrollExpensesService],
  exports: [PayrollExpensesService],
})
export class PayrollExpensesModule {}
