import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { PatientsModule } from "../patients/patients.module";
import { StorageModule } from "../storage/storage.module";
import { FrontDeskController } from "./front-desk.controller";
import { FrontDeskFlowModule } from "./front-desk-flow.module";
import { FrontDeskService } from "./front-desk.service";

@Module({
  imports: [PatientsModule, FrontDeskFlowModule, StorageModule, ComplianceModule],
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
})
export class FrontDeskModule {}
