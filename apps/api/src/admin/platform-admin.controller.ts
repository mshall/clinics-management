import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@Controller("admin/platform")
@UseGuards(JwtAuthGuard)
export class PlatformAdminController {
  constructor(private readonly platform: PlatformAdminService) {}

  @Get("overview")
  @ApiOperation({ summary: "Platform-wide KPIs (platform super admin)" })
  @ApiOkResponse()
  overview(@CurrentUser() user: JwtUser) {
    return this.platform.getOverview(user);
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
  ) {
    return this.platform.listAllUsers(user, page, pageSize, tenantId);
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
  ) {
    return this.platform.listUsers(user, tenantId, page, pageSize);
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
}
