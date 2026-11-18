import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexProgressService } from "./kiorex-progress.service";

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class KiorexProgressController {
  constructor(private readonly progress: KiorexProgressService) {}

  @Get("kiorex-progress")
  @ApiOperation({ summary: "CR-07 Kiorex progress toward Kiorly free this month" })
  kiorexProgress(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.progress.getProgress(user, period);
  }
}