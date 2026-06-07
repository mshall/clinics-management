import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { OperationStatus, UserRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CreateOperationDto } from "./dto/create-operation.dto";
import { OperationDto } from "./dto/operation.dto";
import { UpdateOperationDto } from "./dto/update-operation.dto";
import { OperationsService } from "./operations.service";

const OPERATIONS_VIEW_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
  UserRole.PHYSICIAN,
]);

const OPERATIONS_CREATE_ROLES: Set<UserRole> = new Set([
  UserRole.GROUP_ADMIN,
  UserRole.CLINIC_ADMIN,
  UserRole.BRANCH_MANAGER,
  UserRole.CLINIC_ASSISTANT,
  UserRole.RECEPTIONIST,
]);

const OPERATIONS_STATUS_ROLES: Set<UserRole> = new Set([
  ...OPERATIONS_CREATE_ROLES,
  UserRole.PHYSICIAN,
]);

class PatchOperationStatusDto {
  @ApiProperty({ enum: OperationStatus })
  @IsEnum(OperationStatus)
  status!: OperationStatus;

  @ApiPropertyOptional({
    description: "Amount collected now; required when completing with an outstanding balance",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectionAmount?: number;
}

@ApiTags("operations")
@ApiBearerAuth("bearer")
@Controller("operations")
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  private assertViewAccess(user: JwtUser): void {
    if (!OPERATIONS_VIEW_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to access operations");
    }
  }

  private assertCreateAccess(user: JwtUser): void {
    if (!OPERATIONS_CREATE_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to schedule operations");
    }
  }

  private assertStatusAccess(user: JwtUser): void {
    if (!OPERATIONS_STATUS_ROLES.has(user.role)) {
      throw new ForbiddenException("You do not have permission to update operation status");
    }
  }

  @Get()
  @ApiOperation({ summary: "List operations (physicians see only their assigned procedures)" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("clinicId") clinicId?: string,
    @Query("status") status?: string
  ) {
    this.assertViewAccess(user);
    return this.operations.list(requireTenantId(user), user, from, to, page, pageSize, sortBy, sortOrder, clinicId, status);
  }

  @Get("payable")
  @ApiOperation({ summary: "List operations with an outstanding balance (for revenue payments)" })
  @ApiOkResponse({ type: OperationDto, isArray: true })
  listPayable(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId?: string) {
    this.assertViewAccess(user);
    return this.operations.listPayable(requireTenantId(user), user, clinicId);
  }

  @Post()
  @ApiOperation({ summary: "Schedule a new operation" })
  @ApiCreatedResponse({ type: OperationDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateOperationDto) {
    this.assertCreateAccess(user);
    return this.operations.create(requireTenantId(user), body, user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a scheduled operation" })
  @ApiOkResponse({ type: OperationDto })
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: UpdateOperationDto) {
    this.assertStatusAccess(user);
    return this.operations.update(requireTenantId(user), id, body, user);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update operation status (completed posts revenue; cancelled voids revenue)" })
  @ApiOkResponse({ type: OperationDto })
  patchStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchOperationStatusDto) {
    this.assertStatusAccess(user);
    return this.operations.updateStatus(requireTenantId(user), id, body.status, user, body.collectionAmount);
  }
}
