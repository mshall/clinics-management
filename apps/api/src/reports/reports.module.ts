import { Module } from "@nestjs/common";
import { PayrollExpensesModule } from "../payroll/payroll-expenses.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PayrollExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
