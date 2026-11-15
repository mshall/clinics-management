import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { FiscalSubmitService } from "./fiscal-submit.service";

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, FiscalSubmitService],
})
export class ComplianceModule {}
