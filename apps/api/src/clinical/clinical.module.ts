import { Module } from "@nestjs/common";
import { ClinicalController } from "./clinical.controller";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalService, ClinicalSafetyService],
  exports: [ClinicalSafetyService],
})
export class ClinicalModule {}
