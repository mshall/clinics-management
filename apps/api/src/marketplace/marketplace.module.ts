import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { PatientsModule } from "../patients/patients.module";
import { BillingPlatformModule } from "../billing-platform/billing-platform.module";
import { BillingModule } from "../billing/billing.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PushModule } from "../push/push.module";
import { StorageModule } from "../storage/storage.module";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceApiService } from "./marketplace-api.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { MarketplaceOrgController } from "./marketplace-org.controller";
import { MarketplaceListingsProfileController } from "./marketplace-listings-profile.controller";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";
import { PlatformIntegrationClientService } from "./platform-integration-client.service";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceBookingService } from "./marketplace-booking.service";
import { MarketplacePatientIntakeService } from "./marketplace-patient-intake.service";
import { SlotHoldExpiryScheduler } from "./slot-hold-expiry.scheduler";
import { KiorexSettingsController } from "./kiorex-settings.controller";
import { KiorexSettingsService } from "./kiorex-settings.service";
import { KiorexReviewsService } from "./kiorex-reviews.service";
import { ClinicBookingPageService } from "./clinic-booking-page.service";
import { KiorexOverviewService } from "./kiorex-overview.service";
import { PublicBookingPageController } from "./public-booking-page.controller";
import { RecordShareModule } from "./record-share.module";
import { SlotCapacityService } from "./slot-capacity.service";
import { MarketplaceWaitlistService } from "./marketplace-waitlist.service";

@Module({
  imports: [
    IntegrationsModule,
    SchedulingModule,
    MessagingModule,
    PushModule,
    AuditModule,
    StorageModule,
    AppointmentsModule,
    ComplianceModule,
    PatientsModule,
    BillingPlatformModule,
    BillingModule,
    RecordShareModule,
  ],
  controllers: [
    MarketplaceController,
    MarketplaceOrgController,
    MarketplaceListingsProfileController,
    KiorexSettingsController,
    PublicBookingPageController,
  ],
  providers: [
    KiorexSettingsService,
    KiorexReviewsService,
    ClinicBookingPageService,
    KiorexOverviewService,
    PlatformIntegrationClientService,
    MarketplaceAuthGuard,
    MarketplaceAccessService,
    MarketplaceListingService,
    MarketplaceApiService,
    MarketplaceProviderProfileService,
    SlotHoldService,
    MarketplacePatientIntakeService,
    MarketplaceBookingService,
    SlotHoldExpiryScheduler,
    SlotCapacityService,
    MarketplaceWaitlistService,
  ],
  exports: [MarketplaceListingService, PlatformIntegrationClientService, MarketplaceProviderProfileService],
})
export class MarketplaceModule {}