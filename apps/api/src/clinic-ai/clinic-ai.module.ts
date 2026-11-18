import { Module } from "@nestjs/common";
import { ClinicAiController } from "./clinic-ai.controller";
import { ClinicAiService } from "./clinic-ai.service";
import { NoShowRiskScheduler } from "./no-show-risk.scheduler";

@Module({
  controllers: [ClinicAiController],
  providers: [ClinicAiService, NoShowRiskScheduler],
})
export class ClinicAiModule {}
