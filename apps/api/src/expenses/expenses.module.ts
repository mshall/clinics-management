import { Module } from "@nestjs/common";
import { PayrollExpensesModule } from "../payroll/payroll-expenses.module";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [PayrollExpensesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
