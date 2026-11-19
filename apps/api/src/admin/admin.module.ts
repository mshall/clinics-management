import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClinicsModule } from "../clinics/clinics.module";
import { MarketsModule } from "../markets/markets.module";
import { ClinicalModule } from "../clinical/clinical.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { StorageModule } from "../storage/storage.module";
import { AdminController } from "./admin.controller";
import { AdminInsightsService } from "./admin-insights.service";
import { AdminService } from "./admin.service";
import { AdminDataExplorerController } from "./data-explorer/admin-data-explorer.controller";
import { AdminDataExplorerService } from "./data-explorer/admin-data-explorer.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformInsightsService } from "./platform-insights.service";
import { PlatformGrowthService } from "./platform-growth.service";
import { IntegrationFailureAdminService } from "./integration-failure-admin.service";
import { TenantPaymentChannelsService } from "./tenant-payment-channels.service";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { CreditsModule } from "../credits/credits.module";
import { BillingPlatformModule } from "../billing-platform/billing-platform.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { MessagingModule } from "../messaging/messaging.module";
import { AdminOutboxService } from "./admin-outbox.service";
import { SalesKitService } from "../staging/sales-kit.service";

@Module({
  imports: [
    AuthModule,
    ClinicsModule,
    StorageModule,
    IntegrationsModule,
    MarketsModule,
    ClinicalModule,
    SubscriptionsModule,
    CreditsModule,
    BillingPlatformModule,
    ComplianceModule,
    MessagingModule,
  ],
  controllers: [AdminController, AdminDataExplorerController, PlatformAdminController],
  providers: [
    AdminService,
    AdminInsightsService,
    AdminDataExplorerService,
    PlatformAdminService,
    PlatformInsightsService,
    PlatformGrowthService,
    IntegrationFailureAdminService,
    TenantPaymentChannelsService,
    AdminOutboxService,
    SalesKitService,
  ],
})
export class AdminModule {}
