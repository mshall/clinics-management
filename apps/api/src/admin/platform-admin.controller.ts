import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { CreditReason } from "@prisma/client";
import { DeactivateTenantUserDto } from "./dto/deactivate-tenant-user.dto";
import { ReactivateTenantUserDto } from "./dto/reactivate-tenant-user.dto";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicDto } from "../common/dto/clinic.dto";
import { CreateClinicDto } from "../clinics/dto/create-clinic.dto";
import { PatchClinicDto } from "../clinics/dto/patch-clinic.dto";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { CreateTenantUserDto } from "./dto/create-tenant-user.dto";
import { PatchFeatureFlagDto } from "./dto/patch-feature-flag.dto";
import { PlatformPatchTenantDto } from "./dto/platform-patch-tenant.dto";
import { PlatformPatchTenantUserDto } from "./dto/platform-patch-tenant-user.dto";
import { PlatformAdminService } from "./platform-admin.service";
import { PlatformInsightsService } from "./platform-insights.service";
import { PlatformGrowthService } from "./platform-growth.service";
import { DrugDatasetImportService, type DrugDatasetImportPayload } from "../clinical/drug-dataset-import.service";
import { SettlementService } from "../billing-platform/settlement.service";
import { PlatformMoneyAuditService } from "../audit/platform-money-audit.service";
import { SalesKitService } from "../staging/sales-kit.service";
import type { SalesRoiInput } from "../staging/sales-roi";

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@Controller("admin/platform")
@UseGuards(JwtAuthGuard)
export class PlatformAdminController {
  constructor(
    private readonly platform: PlatformAdminService,
    private readonly platformInsights: PlatformInsightsService,
    private readonly platformGrowth: PlatformGrowthService,
    private readonly drugDatasets: DrugDatasetImportService,
    private readonly settlement: SettlementService,
    private readonly platformAudit: PlatformMoneyAuditService,
    private readonly salesKit: SalesKitService,
  ) {}

  @Get("audit")
  @ApiOperation({ summary: "Billing, credits, and plan change audit trail (platform super admin)" })
  listBillingAudit(
    @CurrentUser() user: JwtUser,
    @Query("entity") entity?: string,
    @Query("tenantId") tenantId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.platformAudit.list(user, { entity, tenantId, page, pageSize, q, from, to });
  }

  @Get("overview")
  @ApiOperation({ summary: "Platform-wide KPIs (platform super admin)" })
  @ApiOkResponse()
  overview(@CurrentUser() user: JwtUser) {
    return this.platform.getOverview(user);
  }

  @Get("insights/organizations")
  @ApiOperation({ summary: "360° directory of all organizations (platform super admin)" })
  insightsOrganizations(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.platformInsights.organizationDirectory(user, from, to);
  }

  @Get("insights/platform")
  @ApiOperation({ summary: "Platform-wide insights and market operability" })
  insightsPlatform(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.platformInsights.platformOverview(user, from, to);
  }

  @Get("growth")
  @ApiOperation({ summary: "PA-05 — activation funnel, cohorts, MRR/ARR, Kiorex attach (platform super admin)" })
  @ApiOkResponse()
  growth(@CurrentUser() user: JwtUser) {
    return this.platformGrowth.getGrowth(user);
  }

  @Get("hierarchy")
  @ApiOperation({ summary: "Platform hierarchy tree (all organizations or one filtered)" })
  @ApiOkResponse()
  hierarchy(@CurrentUser() user: JwtUser, @Query("tenantId") tenantId?: string) {
    return this.platform.getHierarchy(user, tenantId);
  }

  @Get("feature-flags")
  @ApiOperation({ summary: "List global feature flags" })
  @ApiOkResponse()
  featureFlags(@CurrentUser() user: JwtUser) {
    return this.platform.listFeatureFlags(user);
  }

  @Get("feature-flags-status")
  @ApiOperation({ summary: "Whether flags are managed by the Kiorex control plane + snapshot freshness (FF05)" })
  @ApiOkResponse()
  featureFlagStatus(@CurrentUser() user: JwtUser) {
    return this.platform.featureFlagStatus(user);
  }

  @Patch("feature-flags/:key")
  @ApiOperation({ summary: "Toggle a global feature flag" })
  @ApiOkResponse()
  patchFeatureFlag(@CurrentUser() user: JwtUser, @Param("key") key: string, @Body() body: PatchFeatureFlagDto) {
    return this.platform.setFeatureFlag(user, key, body.enabled);
  }

  @Get("users")
  @ApiOperation({ summary: "List all organization users (platform-wide)" })
  @ApiOkResponse()
  listAllUsers(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("tenantId") tenantId?: string,
    @Query("archived") archived?: string,
  ) {
    return this.platform.listAllUsers(user, page, pageSize, tenantId, archived);
  }

  @Get("clinics")
  @ApiOperation({ summary: "List all clinics (platform-wide)" })
  @ApiOkResponse()
  listAllClinics(@CurrentUser() user: JwtUser, @Query("tenantId") tenantId?: string) {
    return this.platform.listAllClinics(user, tenantId);
  }

  @Get("tenants")
  @ApiOperation({ summary: "List all organizations (platform super admin)" })
  @ApiOkResponse()
  listTenants(
    @CurrentUser() user: JwtUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
  ) {
    return this.platform.listTenants(user, page, pageSize, sortBy, sortOrder);
  }

  @Post("tenants")
  @ApiOperation({ summary: "Create organization with optional group admin and HQ clinic" })
  @ApiCreatedResponse()
  createTenant(@CurrentUser() user: JwtUser, @Body() body: CreateTenantDto) {
    return this.platform.createTenant(user, body);
  }

  @Get("tenants/:tenantId")
  @ApiOperation({ summary: "Organization detail" })
  @ApiOkResponse()
  getTenant(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string) {
    return this.platform.getTenant(user, tenantId);
  }

  @Patch("tenants/:tenantId")
  @ApiOperation({ summary: "Update organization settings" })
  @ApiOkResponse()
  patchTenant(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string, @Body() body: PlatformPatchTenantDto) {
    return this.platform.patchTenant(user, tenantId, body);
  }

  @Get("tenants/:tenantId/users")
  @ApiOperation({ summary: "List users in an organization" })
  @ApiOkResponse()
  listUsers(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("archived") archived?: string,
  ) {
    return this.platform.listUsers(user, tenantId, page, pageSize, archived);
  }

  @Get("tenants/:tenantId/clinics")
  @ApiOperation({ summary: "List clinics for an organization" })
  @ApiOkResponse({ type: ClinicDto, isArray: true })
  listClinics(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string) {
    return this.platform.listClinics(user, tenantId);
  }

  @Post("tenants/:tenantId/clinics")
  @ApiOperation({ summary: "Create a clinic or branch under an organization" })
  @ApiCreatedResponse({ type: ClinicDto })
  createClinic(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string, @Body() body: CreateClinicDto) {
    return this.platform.createClinic(user, tenantId, body);
  }

  @Get("tenants/:tenantId/clinics/:clinicId")
  @ApiOperation({ summary: "Get clinic registration details" })
  @ApiOkResponse()
  getClinic(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("clinicId") clinicId: string,
  ) {
    return this.platform.getClinic(user, tenantId, clinicId);
  }

  @Patch("tenants/:tenantId/clinics/:clinicId")
  @ApiOperation({ summary: "Update clinic registration details" })
  @ApiOkResponse()
  patchClinic(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("clinicId") clinicId: string,
    @Body() body: PatchClinicDto,
  ) {
    return this.platform.patchClinic(user, tenantId, clinicId, body);
  }

  @Post("tenants/:tenantId/users")
  @ApiOperation({ summary: "Create a user in an organization (optional clinic scope)" })
  @ApiCreatedResponse()
  createUser(@CurrentUser() user: JwtUser, @Param("tenantId") tenantId: string, @Body() body: CreateTenantUserDto) {
    return this.platform.createUser(user, tenantId, body);
  }

  @Get("tenants/:tenantId/users/:userId")
  @ApiOperation({ summary: "Get organization user details" })
  @ApiOkResponse()
  getUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
  ) {
    return this.platform.getUser(user, tenantId, userId);
  }

  @Patch("tenants/:tenantId/users/:userId")
  @ApiOperation({ summary: "Update organization user (email, password, role, clinic scope)" })
  @ApiOkResponse()
  patchUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: PlatformPatchTenantUserDto,
  ) {
    return this.platform.patchUser(user, tenantId, userId, body);
  }

  @Delete("tenants/:tenantId/users/:userId")
  @ApiOperation({ summary: "Archive an organization user and linked employee (platform super admin)" })
  @ApiOkResponse()
  deleteUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
  ) {
    return this.platform.deleteUser(user, tenantId, userId);
  }

  @Post("tenants/:tenantId/users/:userId/deactivate")
  @ApiOperation({ summary: "Deactivate organization user and linked employee (platform super admin)" })
  @ApiOkResponse()
  deactivateUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: DeactivateTenantUserDto,
  ) {
    return this.platform.deactivateUser(user, tenantId, userId, body);
  }

  @Post("tenants/:tenantId/users/:userId/reactivate")
  @ApiOperation({ summary: "Reactivate a deactivated organization user (platform super admin)" })
  @ApiOkResponse()
  reactivateUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: ReactivateTenantUserDto,
  ) {
    return this.platform.reactivateUser(user, tenantId, userId, body);
  }

  @Post("tenants/:tenantId/users/:userId/restore")
  @ApiOperation({ summary: "Restore an archived organization user (platform super admin)" })
  @ApiOkResponse()
  restoreUser(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("userId") userId: string,
    @Body() body: ReactivateTenantUserDto,
  ) {
    return this.platform.restoreUser(user, tenantId, userId, body);
  }

  @Post("payments/:id/verify")
  @ApiOperation({ summary: "Verify manual Kiorly payment (InstaPay / bank proof)" })
  verifyKiorlyPayment(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { approved: boolean },
  ) {
    return this.platform.verifyKiorlyPayment(user, id, body);
  }

  @Post("tenants/:tenantId/credits")
  @ApiOperation({ summary: "Grant SaaS billing credits to an organization (platform super admin)" })
  grantCredits(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Body()
    body: {
      amount: number;
      reason: string;
      expiresAt?: string | null;
      note?: string;
      secondApproverUserId?: string;
    },
  ) {
    return this.platform.grantTenantCredits(user, tenantId, {
      ...body,
      reason: body.reason as CreditReason,
    });
  }

  @Post("settlement/run")
  @ApiOperation({ summary: "Run monthly Kiorly settlement for one or all tenants (platform super admin)" })
  runSettlement(
    @CurrentUser() user: JwtUser,
    @Body() body: { period: string; tenantIds?: string[] },
  ) {
    return this.settlement.runForPlatform(user, body);
  }

  @Post("tenants/:tenantId/extend-trial")
  @ApiOperation({ summary: "Extend an organization SaaS trial (platform super admin)" })
  extendTrial(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Body() body: { days: number; reason: string; trialConfigOverride?: Record<string, unknown> },
  ) {
    return this.platform.extendTenantTrial(user, tenantId, body);
  }

  @Put("tenants/:tenantId/entitlement-overrides/:key")
  @ApiOperation({ summary: "Set an ops entitlement override for an organization (platform super admin)" })
  putEntitlementOverride(
    @CurrentUser() user: JwtUser,
    @Param("tenantId") tenantId: string,
    @Param("key") key: string,
    @Body() body: { valueJson: unknown; reason: string; expiresAt?: string | null },
  ) {
    return this.platform.putTenantEntitlementOverride(user, tenantId, key, body);
  }

  @Get("drug-datasets")
  @ApiOperation({ summary: "List drug dataset versions (platform super admin)" })
  listDrugDatasets(@CurrentUser() user: JwtUser, @Query("marketCode") marketCode?: string) {
    return this.drugDatasets.listVersions(user, marketCode);
  }

  @Post("drug-datasets")
  @ApiOperation({ summary: "Import a versioned market drug dataset (platform super admin)" })
  importDrugDataset(@CurrentUser() user: JwtUser, @Body() body: DrugDatasetImportPayload) {
    return this.drugDatasets.importDataset(user, body);
  }

  @Post("demo/reset")
  @ApiOperation({ summary: "GT-05 — reset sales demo pilot tenants (Lite/Pro/Clinic) in under 60s" })
  @ApiOkResponse()
  resetSalesDemo(@CurrentUser() user: JwtUser, @Body() body: { tier?: string }) {
    return this.salesKit.resetDemo(user, body);
  }

  @Post("sales/roi")
  @ApiOperation({ summary: "GT-05 — sales ROI calculator (no-shows, admin time, Kiorex patients)" })
  @ApiOkResponse()
  salesRoi(@CurrentUser() user: JwtUser, @Body() body: SalesRoiInput) {
    return this.salesKit.roi(body);
  }
}
