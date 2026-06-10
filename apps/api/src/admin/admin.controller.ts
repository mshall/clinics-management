import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { AdminService } from "./admin.service";
import { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import { PatchFeatureFlagDto } from "./dto/patch-feature-flag.dto";
import { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  @ApiOperation({ summary: "Admin dashboard: tenant, flags, audit tail" })
  @ApiOkResponse()
  overview(@CurrentUser() user: JwtUser) {
    const allowed: Set<UserRole> = new Set([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);
    if (!allowed.has(user.role) || !user.tenantId) {
      throw new ForbiddenException("Only administrators can access the admin overview");
    }
    return this.admin.overview(requireTenantId(user));
  }

  @Get("audit-logs")
  @ApiOperation({
    summary: "Paginated audit log (super admin: full tenant; clinic admin: actions tied to assigned clinics)",
  })
  @ApiOkResponse()
  auditLogs(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string
  ) {
    return this.admin.auditLogs(requireTenantId(user), page, pageSize, q, user);
  }

  @Get("tenants")
  @ApiOperation({ summary: "List all organizations (platform)" })
  @ApiOkResponse()
  tenants(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can list all organizations");
    }
    return this.admin.listTenants(page, pageSize, sortBy, sortOrder);
  }

  @Patch("tenant-settings")
  @ApiOperation({ summary: "Update tenant-level settings (group admin only)" })
  @ApiOkResponse()
  patchTenantSettings(@CurrentUser() user: JwtUser, @Body() body: PatchTenantSettingsDto) {
    if (user.role !== "GROUP_ADMIN") {
      throw new ForbiddenException("Only group administrators can update tenant settings");
    }
    return this.admin.patchTenantSettings(requireTenantId(user), body);
  }

  @Post("users")
  @ApiOperation({ summary: "Create a user in the current tenant with a fixed platform role (group admin only)" })
  @ApiCreatedResponse()
  createUser(@CurrentUser() user: JwtUser, @Body() body: CreateTenantUserDto) {
    if (user.role !== "GROUP_ADMIN" || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can create users");
    }
    return this.admin.createTenantUser(requireTenantId(user), body);
  }

  @Patch("feature-flags/:key")
  @ApiOperation({ summary: "Toggle feature flag" })
  @ApiOkResponse()
  patchFlag(@CurrentUser() user: JwtUser, @Param("key") key: string, @Body() body: PatchFeatureFlagDto) {
    if (user.role !== UserRole.GROUP_ADMIN) {
      throw new ForbiddenException("Only platform administrators can change feature flags");
    }
    return this.admin.setFeatureFlag(key, body.enabled);
  }

  @Get("org-hierarchy")
  @ApiOperation({ summary: "Organization tree: clinics, branches, and users" })
  @ApiOkResponse()
  orgHierarchy(@CurrentUser() user: JwtUser) {
    const allowed: Set<UserRole> = new Set([
      UserRole.GROUP_ADMIN,
      UserRole.CLINIC_ADMIN,
      UserRole.BRANCH_MANAGER,
    ]);
    if (!allowed.has(user.role) || !user.tenantId) {
      throw new ForbiddenException("Only organization administrators can view the hierarchy");
    }
    return this.admin.getOrgHierarchyForUser(user, requireTenantId(user));
  }
}
