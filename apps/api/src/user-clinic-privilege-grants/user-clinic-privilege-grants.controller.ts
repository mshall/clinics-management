import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { SetUserClinicPrivilegeGrantDto } from "./dto/set-user-clinic-privilege-grant.dto";
import {
  PrivilegeTemplateEmployeeDto,
  UserClinicPrivilegeGrantDto,
} from "./dto/user-clinic-privilege-grant.dto";
import { UserClinicPrivilegeGrantsService } from "./user-clinic-privilege-grants.service";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin/user-clinic-privilege-grants")
@UseGuards(JwtAuthGuard)
export class UserClinicPrivilegeGrantsController {
  constructor(private readonly grants: UserClinicPrivilegeGrantsService) {}

  @Get()
  @ApiOperation({ summary: "List clinic-scoped privilege grants for a user" })
  @ApiOkResponse({ type: UserClinicPrivilegeGrantDto, isArray: true })
  list(@CurrentUser() user: JwtUser, @Query("userId") userId: string) {
    return this.grants.listForUser(requireTenantId(user), user, userId);
  }

  @Get("template-employees")
  @ApiOperation({ summary: "Employees with linked logins that can be used as privilege templates" })
  @ApiOkResponse({ type: PrivilegeTemplateEmployeeDto, isArray: true })
  templateEmployees(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.grants.listTemplateEmployees(requireTenantId(user), user, clinicId);
  }

  @Put()
  @ApiOperation({ summary: "Grant a user the same functional privileges as a template employee at a clinic" })
  @ApiOkResponse({ type: UserClinicPrivilegeGrantDto })
  upsert(@CurrentUser() user: JwtUser, @Body() body: SetUserClinicPrivilegeGrantDto) {
    return this.grants.upsert(requireTenantId(user), user, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Remove a clinic privilege grant" })
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.grants.remove(requireTenantId(user), user, id);
  }
}
