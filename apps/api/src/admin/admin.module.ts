import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminDataExplorerController } from "./data-explorer/admin-data-explorer.controller";
import { AdminDataExplorerService } from "./data-explorer/admin-data-explorer.service";

@Module({
  controllers: [AdminController, AdminDataExplorerController],
  providers: [AdminService, AdminDataExplorerService],
})
export class AdminModule {}
