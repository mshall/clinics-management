import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ImportsController } from "./imports/imports.controller";
import { ImportsService } from "./imports/imports.service";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { SampleDataService } from "./sample-data.service";

@Module({
  imports: [AuditModule],
  controllers: [OnboardingController, ImportsController],
  providers: [OnboardingService, ImportsService, SampleDataService],
  exports: [OnboardingService, ImportsService],
})
export class OnboardingModule {}
