import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { PatientsModule } from "../patients/patients.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  imports: [SchedulingModule, FrontDeskFlowModule, FeatureFlagsModule, PatientsModule, KiorexModule, SubscriptionsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
