import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ClinicalSpecialty, FeeType } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexCommissionService } from "./kiorex-commission.service";
import { PlatformKiorexRatesCreateBodyDto, PlatformKiorexRatesPatchMarketSettingsBodyDto } from "./platform-kiorex-rates.controller.dto";

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@Controller("admin/platform/kiorex-rates")
@UseGuards(JwtAuthGuard)
export class PlatformKiorexRatesController {
  constructor(private readonly kiorex: KiorexCommissionService) {}

  @Get()
  @ApiOperation({ summary: "List Kiorex commission rates (platform super admin)" })
  list(@CurrentUser() user: JwtUser, @Query("marketId") marketId?: string) {
    return this.kiorex.listForPlatform(user, marketId);
  }

  @Post()
  @ApiOperation({ summary: "Create a Kiorex commission rate row" })
  create(
    @CurrentUser() user: JwtUser,
    @Body()
    body: PlatformKiorexRatesCreateBodyDto,
  ) {
    return this.kiorex.create(user, body);
  }

  @Patch("market/:marketId/settings")
  @ApiOperation({ summary: "Update Kiorex market settings (target ratio, Lite monthly cap)" })
  patchMarketSettings(
    @CurrentUser() user: JwtUser,
    @Param("marketId") marketId: string,
    @Body() body: PlatformKiorexRatesPatchMarketSettingsBodyDto,
  ) {
    return this.kiorex.patchMarketSettings(user, marketId, body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a Kiorex commission rate" })
  patch(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body()
    body: Partial<{
      specialty: ClinicalSpecialty | null;
      feeType: FeeType;
      amount: number | null;
      percent: number | null;
      minAmount: number | null;
      maxAmount: number | null;
      benchmarkFlat: number | null;
      benchmarkPercent: number | null;
      benchmarkSource: string | null;
      benchmarkCheckedAt: string | null;
      validFrom: string;
      validTo: string | null;
    }>,
  ) {
    return this.kiorex.patch(user, id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a Kiorex commission rate" })
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.kiorex.remove(user, id);
  }
}