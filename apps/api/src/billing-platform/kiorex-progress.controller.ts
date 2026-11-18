import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexProgressService } from "./kiorex-progress.service";
import { LiteFeesService } from "./lite-fees.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class KiorexProgressController {
  constructor(
    private readonly progress: KiorexProgressService,
    private readonly liteFees: LiteFeesService,
  ) {}

  @Get("lite-fees")
  @ApiOperation({ summary: "SB-05 Lite plan: Kiorex fees this month, carry-forward and minimum invoice" })
  liteKiorexFees(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.liteFees.getLiteFees(user, period);
  }

  @Get("kiorex-progress")
  @ApiOperation({ summary: "CR-07 Kiorex progress toward Kiorly free this month" })
  kiorexProgress(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.progress.getProgress(user, period);
  }
}