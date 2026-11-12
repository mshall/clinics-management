import { Module } from "@nestjs/common";
import { ClinicsModule } from "../clinics/clinics.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { StorageModule } from "../storage/storage.module";
import { AdminController } from "./admin.controller";
import { AdminInsightsService } from "./admin-insights.service";
import { AdminService } from "./admin.service";
import { AdminDataExplorerController } from "./data-explorer/admin-data-explorer.controller";
import { AdminDataExplorerService } from "./data-explorer/admin-data-explorer.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminService } from "./platform-admin.service";
import { IntegrationFailureAdminService } from "./integration-failure-admin.service";

@Module({
  imports: [ClinicsModule, StorageModule, IntegrationsModule],
  controllers: [AdminController, AdminDataExplorerController, PlatformAdminController],
  providers: [
    AdminService,
    AdminInsightsService,
    AdminDataExplorerService,
    PlatformAdminService,
    IntegrationFailureAdminService,
  ],
})
export class AdminModule {}
