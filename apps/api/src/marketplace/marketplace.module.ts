import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { PatientsModule } from "../patients/patients.module";
import { CreditsModule } from "../credits/credits.module";
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
import { MarketplaceClientBootstrapService } from "./marketplace-client-bootstrap.service";
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
import { HomeVisitsModule } from "../home-visits/home-visits.module";
import { NurseModule } from "../nurse/nurse.module";
import { RecordShareModule } from "./record-share.module";
import { SlotCapacityService } from "./slot-capacity.service";
import { MarketplaceWaitlistService } from "./marketplace-waitlist.service";
import { KiorexImportController } from "./kiorex-import.controller";
import { KiorexImportService } from "./kiorex-import.service";
import { KiorexModule } from "../kiorex/kiorex.module";
import { ProviderLinkCoreModule } from "../growth/provider-links/provider-link-core.module";
import { VerificationCoreModule } from "../growth/provider-marketing/verification-core.module";
import { MarketplaceProviderVerificationController } from "./marketplace-provider-verification.controller";
import { MarketplaceReferralLinksController } from "./marketplace-referral-links.controller";
import { MarketplaceStaffPhoneMatchController } from "./marketplace-staff-phone-match.controller";
import { StaffPhoneMatchService } from "../growth/staff-phone-match.service";
import { KiorexConnectController } from "./kiorex-connect.controller";
import { KiorexConnectService } from "./kiorex-connect.service";
import { KiorexFrontDoorController } from "./kiorex-front-door.controller";
import { KiorexFrontDoorService } from "./kiorex-front-door.service";
import { KiorexConnectionController } from "./kiorex-connection.controller";
import { KiorlyAdminMarketsController } from "./kiorly-admin-markets.controller";
import { KiorlyAdminPlansController } from "./kiorly-admin-plans.controller";
import { MarketsModule } from "../markets/markets.module";
import { PlansModule } from "../plans/plans.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { PromotionsMarketplaceController } from "../promotions/promotions-marketplace.controller";

@Module({
  imports: [
    PlansModule,
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
    CreditsModule,
    PromotionsModule,
    BillingModule,
    RecordShareModule,
    KiorexModule,
    MarketsModule,
    ProviderLinkCoreModule,
    VerificationCoreModule,
    NurseModule,
    // HVBK01/03: the @Optional() HomeVisitService must really be injected, otherwise every Kiorex HOME slot/hold/booking answers 400 "Home visits are not available"
    HomeVisitsModule,
  ],
  controllers: [
    MarketplaceController,
    MarketplaceReferralLinksController,
    MarketplaceStaffPhoneMatchController,
    MarketplaceProviderVerificationController,
    MarketplaceOrgController,
    MarketplaceListingsProfileController,
    KiorexSettingsController,
    PublicBookingPageController,
    KiorexImportController,
    KiorexConnectController,
    KiorexFrontDoorController,
    KiorexConnectionController,
    KiorlyAdminMarketsController,
    KiorlyAdminPlansController,
    PromotionsMarketplaceController,
  ],
  providers: [
    StaffPhoneMatchService,
    KiorexSettingsService,
    KiorexReviewsService,
    ClinicBookingPageService,
    KiorexOverviewService,
    PlatformIntegrationClientService,
    MarketplaceClientBootstrapService,
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
    KiorexImportService,
    KiorexConnectService,
    KiorexFrontDoorService,
  ],
  exports: [MarketplaceListingService, PlatformIntegrationClientService, MarketplaceProviderProfileService],
})
export class MarketplaceModule {}