import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { CreateRevenueDto } from "./dto/create-revenue.dto";
import { RevenueEntryDto } from "./dto/revenue.dto";
import { RevenueTotalsDto } from "./dto/revenue-totals.dto";
import { RevenueService } from "./revenue.service";

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
    @Query("clinicId") clinicId?: string
  ) {
    return this.revenue.totals(user.tenantId, from, to, clinicId);
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
    @Query("sortOrder") sortOrder?: string
  ) {
    return this.revenue.list(user.tenantId, from, to, page, pageSize, clinicId, sortBy, sortOrder);
  }

  @Post()
  @ApiOperation({ summary: "Post a revenue entry" })
  @ApiCreatedResponse({ type: RevenueEntryDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateRevenueDto) {
    return this.revenue.create(user.tenantId, body);
  }
}
