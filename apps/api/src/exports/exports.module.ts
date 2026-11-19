import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { ExportsController } from "./exports.controller";
import { TenantExportService } from "./tenant-export.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [ExportsController],
  providers: [TenantExportService],
  exports: [TenantExportService],
})
export class ExportsModule {}
