import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { PatientsModule } from "../patients/patients.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { MessagingModule } from "../messaging/messaging.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

@Module({
  imports: [
    UserNavTabsModule,
    SchedulingModule,
    FrontDeskFlowModule,
    FeatureFlagsModule,
    PatientsModule,
    KiorexModule,
    SubscriptionsModule,
    MessagingModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
