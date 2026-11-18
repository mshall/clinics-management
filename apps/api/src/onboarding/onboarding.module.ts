import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ImportsController } from "./imports/imports.controller";
import { ImportsService } from "./imports/imports.service";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [AuditModule],
  controllers: [OnboardingController, ImportsController],
  providers: [OnboardingService, ImportsService],
  exports: [OnboardingService, ImportsService],
})
export class OnboardingModule {}
