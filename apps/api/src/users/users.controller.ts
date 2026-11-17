import { Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { UsersService } from "./users.service";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";

@ApiTags("users")
@ApiBearerAuth("bearer")
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private static readonly USER_LIST_ROLES: Set<UserRole> = new Set([
    UserRole.GROUP_ADMIN,
    UserRole.CLINIC_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.HR_OFFICER,
    UserRole.FINANCE_OFFICER,
  ]);

  @Get()
  @ApiOperation({ summary: "List users in tenant (for scheduling, assignments)" })
  @ApiOkResponse()
  list(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
  ) {
    if (!hasAnyRoleInSet(user, UsersController.USER_LIST_ROLES)) {
      throw new ForbiddenException("You do not have permission to list users");
    }
    return this.users.listForTenant(requireTenantId(user), page, pageSize, q);
  }
}
