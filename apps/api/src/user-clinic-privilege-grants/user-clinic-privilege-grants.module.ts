import { Module } from "@nestjs/common";
import { UserClinicPrivilegeGrantsController } from "./user-clinic-privilege-grants.controller";
import { UserClinicPrivilegeGrantsService } from "./user-clinic-privilege-grants.service";

@Module({
  controllers: [UserClinicPrivilegeGrantsController],
  providers: [UserClinicPrivilegeGrantsService],
  exports: [UserClinicPrivilegeGrantsService],
})
export class UserClinicPrivilegeGrantsModule {}
