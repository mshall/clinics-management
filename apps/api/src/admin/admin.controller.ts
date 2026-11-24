import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { assertInsightsAccess } from "../support/support-access";
import { AdminInsightsService } from "./admin-insights.service";
import { AdminService } from "./admin.service";
import { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import { BulkDeleteUsersDto } from "./dto/bulk-delete-users.dto";
import { PatchFeatureFlagDto } from "./dto/patch-feature-flag.dto";
import { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import { DeactivateTenantUserDto } from "./dto/deactivate-tenant-user.dto";
import { ReactivateTenantUserDto } from "./dto/reactivate-tenant-user.dto";
import { PatchTenantSettingsDto } from "./dto/patch-tenant-settings.dto";
import { PatchUserRolesDto } from "./dto/patch-user-roles.dto";
import { TransferTenantOwnershipDto } from "./dto/transfer-tenant-ownership.dto";
import { PatchIntegrationFailureDto } from "./dto/patch-integration-failure.dto";
import { IntegrationFailureAdminService } from "./integration-failure-admin.service";
import { TenantPaymentChannelsService } from "./tenant-payment-channels.service";
import { CreateTenantPaymentChannelDto } from "./dto/create-tenant-payment-channel.dto";
import { hasAnyRole, hasAnyRoleInSet, hasRole } from "../common/effective-roles";
import { AdminOutboxService } from "./admin-outbox.service";

@ApiTags("admin")
@ApiBearerAuth("bearer")
@Controller("admin")
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly insights: AdminInsightsService,
    private readonly integrationFailureAdmin: IntegrationFailureAdminService,
    private readonly paymentChannels: TenantPaymentChannelsService,
    private readonly outboxAdmin: AdminOutboxService,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Admin dashboard: tenant, flags, audit tail" })
  @ApiOkResponse()
  overview(@CurrentUser() user: JwtUser) {
    const allowed: Set<UserRole> = new Set([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER]);
    if (!hasAnyRoleInSet(user, allowed) || !user.tenantId) {
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
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("action") action?: string,
    @Query("resource") resource?: string,
    @Query("actorId") actorId?: string,
  ) {
    return this.admin.auditLogs(requireTenantId(user), page, pageSize, q, user, { from, to, action, resource, actorId });
  }

  @Get("integration-failures")
  @ApiOperation({
    summary: "Failed integration / webhook operations with request tracing and resolution hints (governance)",
  })
  @ApiOkResponse()
  integrationFailures(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
    @Query("integrationClientId") integrationClientId?: string,
    @Query("clinicId") clinicId?: string,
    @Query("status") status?: string,
    @Query("locale") locale?: string,
  ) {
    return this.integrationFailureAdmin.list(requireTenantId(user), page, pageSize, q, user, {
      from,
      to,
      category,
      integrationClientId,
      clinicId,
      status,
      locale,
    });
  }

  @Get("integration-failures/summary")
  @ApiOperation({ summary: "Integration failure metrics for governance dashboard" })
  @ApiOkResponse()
  integrationFailuresSummary(@CurrentUser() user: JwtUser) {
    return this.integrationFailureAdmin.summary(requireTenantId(user), user);
  }

  @Get("integration-failures/groups")
  @ApiOperation({ summary: "Grouped integration failures by fingerprint" })
  @ApiOkResponse()
  integrationFailureGroups(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
    @Query("locale") locale?: string,
  ) {
    return this.integrationFailureAdmin.groups(requireTenantId(user), page, pageSize, user, {
      from,
      to,
      category,
      locale,
    });
  }

  @Get("integration-failures/export")
  @ApiOperation({ summary: "Export integration failures as CSV" })
  @Header("Content-Type", "text/csv; charset=utf-8")
  async integrationFailuresExport(
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("category") category?: string,
    @Query("integrationClientId") integrationClientId?: string,
    @Query("clinicId") clinicId?: string,
    @Query("status") status?: string,
  ) {
    const csv = await this.integrationFailureAdmin.exportCsv(requireTenantId(user), user, {
      from,
      to,
      category,
      integrationClientId,
      clinicId,
      status,
    }, q);
    res.setHeader("Content-Disposition", 'attachment; filename="integration-failures.csv"');
    res.send(csv);
  }

  @Get("integration-failures/:id")
  @ApiOperation({ summary: "Full trace for one integration failure record" })
  @ApiOkResponse()
  integrationFailureById(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("locale") locale?: string,
  ) {
    return this.integrationFailureAdmin.byId(requireTenantId(user), id, user, locale);
  }

  @Patch("integration-failures/:id")
  @ApiOperation({ summary: "Acknowledge or resolve an integration failure" })
  @ApiOkResponse()
  patchIntegrationFailure(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: PatchIntegrationFailureDto,
  ) {
    return this.integrationFailureAdmin.patchStatus(requireTenantId(user), id, user, body);
  }

  @Post("integration-failures/:id/retry-webhook")
  @HttpCode(200)
  @ApiOperation({ summary: "Re-attempt webhook delivery for a logged failure" })
  @ApiOkResponse()
  retryIntegrationFailureWebhook(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.integrationFailureAdmin.retryWebhook(requireTenantId(user), id, user);
  }

  @Get("outbox-events")
  @ApiOperation({ summary: "Transactional outbox events (governance)" })
  @ApiOkResponse()
  outboxEvents(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
  ) {
    return this.outboxAdmin.list(requireTenantId(user), user, page, pageSize, status, type);
  }

  @Get("outbox-events/summary")
  @ApiOperation({ summary: "Outbox lag and counts" })
  @ApiOkResponse()
  outboxEventsSummary(@CurrentUser() user: JwtUser) {
    return this.outboxAdmin.summary(requireTenantId(user), user);
  }

  @Post("outbox-events/:id/retry")
  @HttpCode(200)
  @ApiOperation({ summary: "Re-dispatch one outbox event" })
  @ApiOkResponse()
  retryOutboxEvent(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.outboxAdmin.retry(requireTenantId(user), user, id);
  }

  @Post("integration-failures/purge-retention")
  @HttpCode(200)
  @ApiOperation({ summary: "Apply retention policy now (group admin)" })
  @ApiOkResponse()
  purgeIntegrationFailureRetention(@CurrentUser() user: JwtUser) {
    return this.integrationFailureAdmin.purgeNow(requireTenantId(user), user);
  }

  @Get("insights/overview-360")
  @ApiOperation({ summary: "Organization 360° performance and audit overview" })
  @ApiOkResponse()
  insightsOverview360(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    assertInsightsAccess(user);
    return this.insights.overview360(requireTenantId(user), user, from, to);
  }

  @Get("insights/staff-performance")
  @ApiOperation({ summary: "Staff activity and performance metrics" })
  @ApiOkResponse()
  insightsStaffPerformance(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    assertInsightsAccess(user);
    return this.insights.staffPerformance(requireTenantId(user), user, from, to);
  }

  @Get("tenants")
  @ApiOperation({ summary: "List all organizations (platform)" })
  @ApiOkResponse()
  tenants(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("q") q?: string,
  ) {
    if (!isPlatformSuperAdmin(user)) {
      throw new ForbiddenException("Only platform super administrators can list all organizations");
    }
    return this.admin.listTenants(page, pageSize, sortBy, sortOrder, q);
  }

  @Patch("tenant-settings")
  @ApiOperation({ summary: "Update tenant-level settings (group admin only)" })
  @ApiOkResponse()
  patchTenantSettings(@CurrentUser() user: JwtUser, @Body() body: PatchTenantSettingsDto) {
    // The self-serve owner is a physician with isTenantOwner: the organisation owner may change tenant settings (quick setup: WhatsApp reminders).
    if (user.role !== "GROUP_ADMIN" && !user.isTenantOwner) {
      throw new ForbiddenException("Only group administrators or the organisation owner can update tenant settings");
    }
    return this.admin.patchTenantSettings(requireTenantId(user), user, body);
  }

  @Get("sign-in-method")
  @ApiOperation({ summary: "Organisation default sign-in method (Passport or password preselected on the login page); group admin only" })
  @ApiOkResponse()
  getSignInMethod(@CurrentUser() user: JwtUser) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) throw new ForbiddenException("Only group administrators can read the sign-in default");
    return this.admin.getSignInDefault(requireTenantId(user));
  }

  @Put("sign-in-method")
  @ApiOperation({ summary: "Set the organisation default sign-in method (PASSWORD | PASSPORT | null = automatic); both methods stay available" })
  @ApiOkResponse()
  putSignInMethod(@CurrentUser() user: JwtUser, @Body() body: { defaultSignInMethod?: unknown }) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) throw new ForbiddenException("Only group administrators can change the sign-in default");
    return this.admin.setSignInDefault(requireTenantId(user), user, body?.defaultSignInMethod);
  }

  @Get("payment-channels")
  @ApiOperation({ summary: "List organization payment channels (group admin)" })
  listPaymentChannels(@CurrentUser() user: JwtUser) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only group administrators can manage payment channels");
    }
    return this.paymentChannels.list(requireTenantId(user));
  }

  @Post("payment-channels")
  @ApiOperation({ summary: "Add organization payment channel (group admin)" })
  @ApiCreatedResponse()
  createPaymentChannel(@CurrentUser() user: JwtUser, @Body() body: CreateTenantPaymentChannelDto) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only group administrators can manage payment channels");
    }
    return this.paymentChannels.create(user, requireTenantId(user), body);
  }

  @Delete("payment-channels/:id")
  @ApiOperation({ summary: "Remove organization payment channel (group admin)" })
  deletePaymentChannel(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only group administrators can manage payment channels");
    }
    return this.paymentChannels.remove(user, requireTenantId(user), id);
  }

  @Get("users")
  @ApiOperation({ summary: "List users in the current organization (group admin only)" })
  @ApiOkResponse()
  listUsers(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("role") role?: string,
    @Query("archived") archived?: string,
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can list organization users");
    }
    return this.admin.listTenantUsers(requireTenantId(user), page, pageSize, q, role, archived);
  }

  @Get("users/:userId")
  @ApiOperation({ summary: "Organization user detail (group admin only)" })
  @ApiOkResponse()
  getUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can view organization users");
    }
    return this.admin.getTenantUser(requireTenantId(user), userId);
  }

  @Post("users")
  @ApiOperation({ summary: "Create a user in the current tenant with a fixed platform role (group admin only)" })
  @ApiCreatedResponse()
  createUser(@CurrentUser() user: JwtUser, @Body() body: CreateTenantUserDto) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can create users");
    }
    return this.admin.createTenantUser(requireTenantId(user), body, user);
  }

  @Post("users/bulk-delete")
  @HttpCode(200)
  @ApiOperation({ summary: "Delete multiple organization users (group admin only)" })
  @ApiOkResponse({ description: "{ ok: true, deleted: number, failed: { id, message }[] }" })
  bulkDeleteUsers(@CurrentUser() user: JwtUser, @Body() body: BulkDeleteUsersDto) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can delete organization users");
    }
    return this.admin.deleteTenantUsersBulk(requireTenantId(user), body, user);
  }

  @Patch("users/:userId/roles")
  @ApiOperation({ summary: "Set additional roles for an organization user" })
  patchUserRoles(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Body() body: PatchUserRolesDto,
  ) {
    return this.admin.patchUserAdditionalRoles(requireTenantId(user), userId, user, body);
  }

  @Post("tenant/transfer-ownership")
  @HttpCode(200)
  @ApiOperation({ summary: "Transfer tenant ownership to another user (owner, MFA re-check)" })
  transferOwnership(@CurrentUser() user: JwtUser, @Body() body: TransferTenantOwnershipDto) {
    return this.admin.transferTenantOwnership(requireTenantId(user), user, body);
  }

  @Patch("users/:userId")
  @ApiOperation({ summary: "Update an organization user (group admin only)" })
  @ApiOkResponse()
  patchUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string, @Body() body: PlatformPatchTenantUserDto) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can update organization users");
    }
    return this.admin.updateTenantUser(requireTenantId(user), userId, body, user);
  }

  @Delete("users/:userId")
  @ApiOperation({ summary: "Archive an organization user and linked employee (soft delete, group admin only)" })
  @ApiOkResponse()
  deleteUser(@CurrentUser() user: JwtUser, @Param("userId") userId: string) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can archive organization users");
    }
    return this.admin.deleteTenantUser(requireTenantId(user), userId, user);
  }

  @Post("users/:userId/deactivate")
  @ApiOperation({ summary: "Deactivate organization user and linked employee" })
  @ApiOkResponse()
  deactivateUser(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Body() body: DeactivateTenantUserDto,
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can deactivate organization users");
    }
    return this.admin.deactivateTenantUser(requireTenantId(user), userId, body, user);
  }

  @Post("users/:userId/reactivate")
  @ApiOperation({ summary: "Reactivate a deactivated organization user and linked employee" })
  @ApiOkResponse()
  reactivateUser(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Body() body: ReactivateTenantUserDto,
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can reactivate organization users");
    }
    return this.admin.reactivateTenantUser(requireTenantId(user), userId, body);
  }

  @Post("users/:userId/restore")
  @ApiOperation({ summary: "Restore an archived organization user and linked employee" })
  @ApiOkResponse()
  restoreUser(
    @CurrentUser() user: JwtUser,
    @Param("userId") userId: string,
    @Body() body: ReactivateTenantUserDto,
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN) || !user.tenantId) {
      throw new ForbiddenException("Only group administrators can restore organization users");
    }
    return this.admin.restoreTenantUserAccount(requireTenantId(user), userId, body);
  }

  @Patch("tenant-feature-flags/:key")
  @ApiOperation({ summary: "Set organization feature flag override" })
  @ApiOkResponse()
  patchTenantFeatureFlag(
    @CurrentUser() user: JwtUser,
    @Param("key") key: string,
    @Body() body: PatchFeatureFlagDto,
  ) {
    if (!hasRole(user, UserRole.GROUP_ADMIN)) {
      throw new ForbiddenException("Only group administrators can change organization feature flags");
    }
    return this.admin.setTenantFeatureFlag(requireTenantId(user), key, body.enabled);
  }

  @Get("org-hierarchy")
  @ApiOperation({ summary: "Organization tree: clinics, branches, and users" })
  @ApiOkResponse()
  orgHierarchy(@CurrentUser() user: JwtUser) {
    const allowed: Set<UserRole> = new Set([
      UserRole.GROUP_ADMIN,
      UserRole.GROUP_SUPERVISOR,
      UserRole.CLINIC_ADMIN,
      UserRole.BRANCH_MANAGER,
      UserRole.HR_OFFICER,
    ]);
    if (!hasAnyRoleInSet(user, allowed) || !user.tenantId) {
      throw new ForbiddenException("You do not have permission to view the organization hierarchy");
    }
    return this.admin.getOrgHierarchyForUser(user, requireTenantId(user));
  }
}
