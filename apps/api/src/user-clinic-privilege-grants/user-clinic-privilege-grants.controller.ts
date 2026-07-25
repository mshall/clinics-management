import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SetUserClinicHrAssignmentDto } from "./dto/set-user-clinic-privilege-grant.dto";
import { UserClinicHrAssignmentDto } from "./dto/user-clinic-privilege-grant.dto";
import { UserClinicPrivilegeGrantsService } from "./user-clinic-privilege-grants.service";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/user-clinic-hr-assignments")
@UseGuards(JwtAuthGuard)
export class UserClinicPrivilegeGrantsController {
  constructor(private readonly grants: UserClinicPrivilegeGrantsService) {}

  @Get()
  @ApiOperation({ summary: "List clinics where a user is assigned as HR" })
  @ApiOkResponse({ type: UserClinicHrAssignmentDto, isArray: true })
  list(@CurrentUser() user: JwtUser, @Query("userId") userId: string) {
    return this.grants.listForUser(requireTenantId(user), user, userId);
  }

  @Put()
  @ApiOperation({ summary: "Assign a user as HR for a specific clinic" })
  @ApiOkResponse({ type: UserClinicHrAssignmentDto })
  assign(@CurrentUser() user: JwtUser, @Body() body: SetUserClinicHrAssignmentDto) {
    return this.grants.assign(requireTenantId(user), user, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Remove a clinic HR assignment" })
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.grants.remove(requireTenantId(user), user, id);
  }
}
