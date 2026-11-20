import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { EncountersModule } from "../encounters/encounters.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { NurseModule } from "../nurse/nurse.module";
import { RevenueModule } from "../revenue/revenue.module";
import { MobileAlertsService } from "./mobile-alerts.service";
import { MobileEntitlementService } from "./mobile-entitlement.service";
import { MobilePushModule } from "./mobile-push.module";
import { MobilePushService } from "./mobile-push.service";
import { MobileController } from "./mobile.controller";
import { MobileInterceptor } from "./mobile.interceptor";
import { MobileService } from "./mobile.service";

/** Kiorly Work (staff mobile app) backend: bootstrap, entitlement `mobile_staff_app`, device-bound tokens, mock push inbox, safety alerts, app aggregates. */
@Module({
  imports: [MobilePushModule, EncountersModule, EntitlementsModule, NurseModule, RevenueModule],
  controllers: [MobileController],
  providers: [MobileService, MobileAlertsService, MobileEntitlementService, { provide: APP_INTERCEPTOR, useClass: MobileInterceptor }],
  exports: [MobileEntitlementService, MobileAlertsService],
})
export class MobileModule {}
