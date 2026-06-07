import { Module } from "@nestjs/common";
import { ClinicsModule } from "../clinics/clinics.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminDataExplorerController } from "./data-explorer/admin-data-explorer.controller";
import { AdminDataExplorerService } from "./data-explorer/admin-data-explorer.service";
import { PlatformAdminController } from "./platform-admin.controller";
import { PlatformAdminService } from "./platform-admin.service";

@Module({
  imports: [ClinicsModule],
  controllers: [AdminController, AdminDataExplorerController, PlatformAdminController],
  providers: [AdminService, AdminDataExplorerService, PlatformAdminService],
})
export class AdminModule {}
