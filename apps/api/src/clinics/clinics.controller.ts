import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { ClinicDto } from "../common/dto/clinic.dto";
import { AssignClinicPhysicianDto, ClinicPhysicianDto } from "./dto/clinic-physician.dto";
import { ClinicDetailDto } from "./dto/clinic-detail.dto";
import { CreateClinicDto } from "./dto/create-clinic.dto";
import { PatchClinicDto } from "./dto/patch-clinic.dto";
import { ClinicsService } from "./clinics.service";

const SCHEDULING_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.GROUP_SUPERVISOR,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.CALL_CENTER,
]);

const CLINIC_UPDATE_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
]);

@ApiTags("clinics")
@ApiBearerAuth("bearer")
@Controller("clinics")
@UseGuards(JwtAuthGuard)
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get()
  @ApiOperation({ summary: "List clinics and branches for the tenant" })
  @ApiOkResponse({ type: ClinicDto, isArray: true })
  list(@CurrentUser() user: JwtUser) {
    return this.clinics.list(requireTenantId(user), user);
  }

  @Get("physicians/scheduling")
  @ApiOperation({ summary: "List physicians for scheduling (optionally scoped to a clinic)" })
  @ApiOkResponse({ type: ClinicPhysicianDto, isArray: true })
  listSchedulingPhysicians(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId?: string,
    @Query("search") search?: string
  ) {
    if (!SCHEDULING_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to list physicians");
    }
    return this.clinics.listSchedulingPhysicians(requireTenantId(user), user, clinicId, search);
  }

  @Post()
  @ApiOperation({ summary: "Create a parent clinic or a branch under a parent" })
  @ApiCreatedResponse({ description: "ClinicDto" })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateClinicDto) {
    return this.clinics.create(requireTenantId(user), body);
  }

  @Get(":id/physicians/available")
  @ApiOperation({ summary: "Physicians in the tenant not yet assigned to this clinic" })
  @ApiOkResponse({ type: ClinicPhysicianDto, isArray: true })
  listAvailablePhysicians(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("search") search?: string
  ) {
    return this.clinics.listAvailablePhysicians(requireTenantId(user), id, user, search);
  }

  @Get(":id/physicians")
  @ApiOperation({ summary: "Physicians assigned to this clinic" })
  @ApiOkResponse({ type: ClinicPhysicianDto, isArray: true })
  listClinicPhysicians(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query("search") search?: string
  ) {
    return this.clinics.listClinicPhysicians(requireTenantId(user), id, user, search);
  }

  @Post(":id/physicians")
  @ApiOperation({ summary: "Assign a physician to this clinic" })
  @ApiCreatedResponse({ type: ClinicPhysicianDto })
  assignPhysician(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: AssignClinicPhysicianDto) {
    return this.clinics.assignPhysician(requireTenantId(user), id, body.userId, user);
  }

  @Delete(":id/physicians/:userId")
  @ApiOperation({ summary: "Remove a physician assignment from this clinic" })
  @ApiOkResponse({ description: "Removed" })
  removePhysician(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("userId") userId: string) {
    return this.clinics.removePhysician(requireTenantId(user), id, userId, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one clinic including registration fields from admin" })
  @ApiOkResponse({ type: ClinicDetailDto })
  getOne(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.clinics.getOne(requireTenantId(user), id, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update clinic registration fields" })
  @ApiOkResponse({ type: ClinicDetailDto })
  patch(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchClinicDto) {
    if (!CLINIC_UPDATE_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to update this clinic");
    }
    return this.clinics.update(requireTenantId(user), id, body, user);
  }
}
