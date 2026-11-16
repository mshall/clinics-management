import { Module } from "@nestjs/common";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  imports: [SchedulingModule, FrontDeskFlowModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
