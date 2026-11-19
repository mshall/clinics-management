import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { UsageModule } from "../usage/usage.module";
import { ClinicAiController } from "./clinic-ai.controller";
import { ClinicAiService } from "./clinic-ai.service";
import { NoShowRiskScheduler } from "./no-show-risk.scheduler";

@Module({
  imports: [ComplianceModule, UsageModule],
  controllers: [ClinicAiController],
  providers: [ClinicAiService, NoShowRiskScheduler],
  exports: [ClinicAiService],
})
export class ClinicAiModule {}
