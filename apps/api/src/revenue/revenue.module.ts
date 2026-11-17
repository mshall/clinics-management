import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { RevenueController } from "./revenue.controller";
import { RevenueService } from "./revenue.service";

@Module({
  imports: [AuditModule, UserNavTabsModule],
  controllers: [RevenueController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
