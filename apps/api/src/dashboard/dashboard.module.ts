import { Module } from "@nestjs/common";
import { PayrollExpensesModule } from "../payroll/payroll-expenses.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [PayrollExpensesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
