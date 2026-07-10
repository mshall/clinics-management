import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantRoleNavTabsController } from "./tenant-role-nav-tabs.controller";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";
import { UserNavTabsController } from "./user-nav-tabs.controller";
import { UserNavTabsService } from "./user-nav-tabs.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserNavTabsController, TenantRoleNavTabsController],
  providers: [UserNavTabsService, TenantRoleNavTabsService],
  exports: [UserNavTabsService, TenantRoleNavTabsService],
})
export class UserNavTabsModule {}
