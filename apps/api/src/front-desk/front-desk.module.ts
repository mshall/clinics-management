import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { FrontDeskController } from "./front-desk.controller";
import { FrontDeskFlowModule } from "./front-desk-flow.module";
import { FrontDeskService } from "./front-desk.service";

@Module({
  imports: [PatientsModule, FrontDeskFlowModule],
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
})
export class FrontDeskModule {}
