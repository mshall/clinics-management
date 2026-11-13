import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { EncountersController } from "./encounters.controller";
import { EncountersService } from "./encounters.service";

@Module({
  imports: [PatientsModule],
  controllers: [EncountersController],
  providers: [EncountersService],
  exports: [EncountersService],
})
export class EncountersModule {}
