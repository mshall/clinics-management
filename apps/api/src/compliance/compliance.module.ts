import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { ConsentPolicyService } from "./consent-policy.service";

@Module({
  imports: [AuditModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, ConsentPolicyService],
  exports: [ConsentPolicyService],
})
export class ComplianceModule {}