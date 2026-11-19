import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { ClinicianVerificationController } from "./clinician-verification.controller";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { PlatformVerificationsController } from "./platform-verifications.controller";
import { ProfessionController } from "./profession.controller";
import { ProfessionReverificationScheduler } from "./profession-reverification.scheduler";
import { ProfessionReverificationService } from "./profession-reverification.service";

@Module({
  imports: [StorageModule, AuditModule],
  controllers: [ClinicianVerificationController, PlatformVerificationsController, ProfessionController],
  providers: [ClinicianVerificationService, ProfessionReverificationService, ProfessionReverificationScheduler],
  exports: [ClinicianVerificationService, ProfessionReverificationService],
})
export class ClinicianVerificationModule {}