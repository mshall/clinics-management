import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { ClinicianVerificationController } from "./clinician-verification.controller";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { PlatformVerificationsController } from "./platform-verifications.controller";

@Module({
  imports: [StorageModule, AuditModule],
  controllers: [ClinicianVerificationController, PlatformVerificationsController],
  providers: [ClinicianVerificationService],
  exports: [ClinicianVerificationService],
})
export class ClinicianVerificationModule {}