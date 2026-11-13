import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { FrontDeskController } from "./front-desk.controller";
import { FrontDeskService } from "./front-desk.service";

@Module({
  imports: [PatientsModule],
  controllers: [FrontDeskController],
  providers: [FrontDeskService],
})
export class FrontDeskModule {}
