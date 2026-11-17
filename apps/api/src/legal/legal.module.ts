import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalAcceptanceService } from "./legal-acceptance.service";
import { LegalController } from "./legal.controller";
import { LegalService } from "./legal.service";
import { PublicLegalController } from "./public-legal.controller";

@Module({
  imports: [AuditModule],
  controllers: [PublicLegalController, LegalController],
  providers: [LegalService, LegalAcceptanceService],
  exports: [LegalService, LegalAcceptanceService],
})
export class LegalModule {}