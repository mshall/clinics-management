import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { ClinicalModule } from "../clinical/clinical.module";
import { PatientsModule } from "../patients/patients.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";

@Module({
  imports: [PatientsModule, FrontDeskFlowModule, ClinicalModule, AuditModule, KiorexModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
