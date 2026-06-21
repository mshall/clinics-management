import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { AdminService } from "./admin.service";
import { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import { BulkDeleteUsersDto } from "./dto/bulk-delete-users.dto";
import { PatchFeatureFlagDto } from "./dto/patch-feature-flag.dto";
import { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
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
    summary: "Paginated audit log for the organization (group admin: all actions; clinic admin: assigned clinics)",
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

  @Get("users")
  @ApiOperation({ summary: "List users in the current organization (group admin only)" })
  @ApiOkResponse()
  listUsers(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
  ) {
    if (user.role !== UserRole.GROUP_ADMIN || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can list organization users");
    }
    return this.admin.listTenantUsers(requireTenantId(user), page, pageSize, q);
  }

  @Get("users/:userId")
  @ApiOperation({ summary: "Organization user detail (group admin only)" })
  @ApiOkResponse()
  getUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    if (user.role !== UserRole.GROUP_ADMIN || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can view organization users");
    }
    return this.admin.getTenantUser(requireTenantId(user), userId);
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

  @Post("users/bulk-delete")
  @HttpCode(200)
  @ApiOperation({ summary: "Delete multiple organization users (group admin only)" })
  @ApiOkResponse({ description: "{ ok: true, deleted: number, failed: { id, message }[] }" })
  bulkDeleteUsers(@CurrentUser() user: JwtUser, @Body() body: BulkDeleteUsersDto) {
    if (user.role !== UserRole.GROUP_ADMIN || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can delete organization users");
    }
    return this.admin.deleteTenantUsersBulk(requireTenantId(user), body, user);
  }

  @Patch("users/:userId")
  @ApiOperation({ summary: "Update an organization user (group admin only)" })
  @ApiOkResponse()
  patchUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: PlatformPatchTenantUserDto) {
    if (user.role !== UserRole.GROUP_ADMIN || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can update organization users");
    }
    return this.admin.updateTenantUser(requireTenantId(user), userId, body);
  }

  @Delete("users/:userId")
  @ApiOperation({ summary: "Delete an organization user (group admin only)" })
  @ApiOkResponse()
  deleteUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    if (user.role !== UserRole.GROUP_ADMIN || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can delete organization users");
    }
    return this.admin.deleteTenantUser(requireTenantId(user), userId, user);
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
