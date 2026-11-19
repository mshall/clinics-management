import { Module } from "@nestjs/common";
import { BillingPlatformModule } from "../billing-platform/billing-platform.module";
import { PayrollExpensesModule } from "../payroll/payroll-expenses.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { KiorexImpactService } from "./kiorex-impact.service";
import { ReportsController } from "./reports.controller";
import { ReportsExportService } from "./reports-export.service";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PayrollExpensesModule, UserNavTabsModule, BillingPlatformModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, KiorexImpactService],
  exports: [ReportsService, ReportsExportService, KiorexImpactService],
})
export class ReportsModule {}
