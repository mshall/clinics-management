import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { Patient360Service } from "./patient-360.service";

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, Patient360Service],
  exports: [PatientsService, Patient360Service],
})
export class PatientsModule {}
