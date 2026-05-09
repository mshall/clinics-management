import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { CreateRevenueDto } from "./dto/create-revenue.dto";
import { RevenueEntryDto } from "./dto/revenue.dto";
import { RevenueTotalsDto } from "./dto/revenue-totals.dto";
import { RevenueService } from "./revenue.service";

function resolveClinicianFilter(user: JwtUser, clinicianIdParam?: string): string | undefined {
  if (user.role === UserRole.PHYSICIAN) return user.userId;
  const raw = clinicianIdParam?.trim();
  if (!raw) return undefined;
  if (
    user.role === UserRole.GROUP_ADMIN ||
    user.role === UserRole.BRANCH_MANAGER ||
    user.role === UserRole.FINANCE_OFFICER
  ) {
    return raw;
  }
  throw new ForbiddenException("clinicianId filter is not permitted for this role");
}

@ApiTags("revenue")
@ApiBearerAuth("bearer")
@Controller("revenue")
@UseGuards(JwtAuthGuard)
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get("totals")
  @ApiOperation({ summary: "Sum gross and net revenue for the reporting range (same filters as list, all pages)" })
  @ApiOkResponse({ type: RevenueTotalsDto })
  totals(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("clinicId") clinicId?: string,
    @Query("clinicianId") clinicianId?: string
  ) {
    const clinicianUserId = resolveClinicianFilter(user, clinicianId);
    return this.revenue.totals(user.tenantId, from, to, clinicId, clinicianUserId);
  }

  @Get("clinic-breakdown")
  @ApiOperation({ summary: "Posted revenue aggregated per clinic (super admin or clinic admin scope)" })
  @ApiOkResponse()
  clinicBreakdown(@CurrentUser() user: JwtUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.revenue.clinicBreakdown(user.tenantId, from, to, user);
  }

  @Get()
  @ApiOperation({ summary: "List revenue entries" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("clinicId") clinicId?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("clinicianId") clinicianId?: string
  ) {
    const clinicianUserId = resolveClinicianFilter(user, clinicianId);
    return this.revenue.list(user.tenantId, from, to, page, pageSize, clinicId, sortBy, sortOrder, clinicianUserId);
  }

  @Post()
  @ApiOperation({ summary: "Post a revenue entry" })
  @ApiCreatedResponse({ type: RevenueEntryDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateRevenueDto) {
    return this.revenue.create(user.tenantId, body);
  }
}
