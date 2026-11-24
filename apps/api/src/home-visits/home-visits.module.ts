import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { KiorexModule } from "../kiorex/kiorex.module";
import { MessagingModule } from "../messaging/messaging.module";
import { ScopeOfPracticeModule } from "../scope-of-practice/scope-of-practice.module";
import { isMock } from "../common/provider-mode";
import { HomeVisitBookingService } from "./home-visit-booking.service";
import { HomeVisitConfigService } from "./home-visit-config.service";
import { HomeVisitExecService } from "./home-visit-exec.service";
import { HomeVisitInternalController } from "./home-visit-internal.controller";
import { HomeVisitPrivacyService } from "./home-visit-privacy.service";
import { HomeVisitReportsService } from "./home-visit-reports.service";
import { HomeVisitSafetyScheduler } from "./home-visit-safety.scheduler";
import { HomeVisitSafetyService } from "./home-visit-safety.service";
import { HomeVisitService } from "./home-visit.service";
import { HomeVisitsController } from "./home-visits.controller";
import { InternalJobKeyGuard } from "./internal-job-key.guard";
import { AmazonRouteMapsAdapter } from "./maps/amazon-route-maps.adapter";
import { MockRouteMapsAdapter } from "./maps/mock-route-maps.adapter";
import { mapsConfig } from "../common/provider-env";
import { ROUTE_MAPS_PORT } from "./maps/route-maps.port";

@Module({
  imports: [AppointmentsModule, AuditModule, FeatureFlagsModule, KiorexModule, MessagingModule, ScopeOfPracticeModule],
  controllers: [HomeVisitsController, HomeVisitInternalController],
  providers: [
    // MODE=mock|real (MAPS_MODE / KIORLY_PROVIDER_MODE_MAPS, default mock): Amazon Location Routes is the real adapter (config only).
    { provide: ROUTE_MAPS_PORT, useFactory: () => (isMock("maps") ? new MockRouteMapsAdapter() : new AmazonRouteMapsAdapter(mapsConfig())) },
    InternalJobKeyGuard,
    HomeVisitConfigService,
    HomeVisitService,
    HomeVisitBookingService,
    HomeVisitExecService,
    HomeVisitSafetyService,
    HomeVisitPrivacyService,
    HomeVisitReportsService,
    HomeVisitSafetyScheduler,
  ],
  exports: [HomeVisitService, HomeVisitBookingService, HomeVisitExecService, HomeVisitConfigService, HomeVisitSafetyService, HomeVisitPrivacyService, ROUTE_MAPS_PORT],
})
export class HomeVisitsModule {}
