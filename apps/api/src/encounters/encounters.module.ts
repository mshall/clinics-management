import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";

@Module({
  imports: [PatientsModule, FrontDeskFlowModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
