import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { ConsentPolicyService } from "./consent-policy.service";
import { FiscalSubmitService } from "./fiscal-submit.service";
import { FiscalSubmissionWorker } from "./fiscal-submission.worker";
import { EtaHealthService } from "./eta-health.service";
import { EtaHealthScheduler } from "./eta-health.scheduler";

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ConsentPolicyService,
    FiscalSubmitService,
    FiscalSubmissionWorker,
    EtaHealthService,
    EtaHealthScheduler,
  ],
  exports: [FiscalSubmitService, ConsentPolicyService, EtaHealthService],
})
export class ComplianceModule {}
