import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UserClinicPrivilegeGrantsModule } from "../user-clinic-privilege-grants/user-clinic-privilege-grants.module";
import { TenantRoleNavTabsController } from "./tenant-role-nav-tabs.controller";
import { TenantRoleNavTabsService } from "./tenant-role-nav-tabs.service";
import { UserNavTabsController } from "./user-nav-tabs.controller";
import { NavTabAccessService } from "./nav-tab-access.service";
import { UserNavTabsService } from "./user-nav-tabs.service";

@Module({
  imports: [PrismaModule, UserClinicPrivilegeGrantsModule],
  controllers: [UserNavTabsController, TenantRoleNavTabsController],
  providers: [UserNavTabsService, TenantRoleNavTabsService, NavTabAccessService],
  exports: [UserNavTabsService, TenantRoleNavTabsService, NavTabAccessService],
})
export class UserNavTabsModule {}
