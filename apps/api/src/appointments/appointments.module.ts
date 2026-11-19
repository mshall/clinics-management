import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { FrontDeskFlowModule } from "../front-desk/front-desk-flow.module";
import { PatientsModule } from "../patients/patients.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { MessagingModule } from "../messaging/messaging.module";
import { BillingModule } from "../billing/billing.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { DepositLinkService } from "./deposit-link.service";
import { DepositLinksController } from "./deposit-links.controller";
import { PublicDepositLinkController } from "./public-deposit-link.controller";

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
    BillingModule,
  ],
  controllers: [AppointmentsController, DepositLinksController, PublicDepositLinkController],
  providers: [AppointmentsService, DepositLinkService],
  exports: [AppointmentsService, DepositLinkService],
})
export class AppointmentsModule {}
