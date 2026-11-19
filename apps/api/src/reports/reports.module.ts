import { Module } from "@nestjs/common";
import { PayrollExpensesModule } from "../payroll/payroll-expenses.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { ReportsController } from "./reports.controller";
import { ReportsExportService } from "./reports-export.service";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PayrollExpensesModule, UserNavTabsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
  exports: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
