import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { FiscalSubmitService } from "./fiscal-submit.service";
import { FiscalSubmissionWorker } from "./fiscal-submission.worker";

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, FiscalSubmitService, FiscalSubmissionWorker],
  exports: [FiscalSubmitService],
})
export class ComplianceModule {}
