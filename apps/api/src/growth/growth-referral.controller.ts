import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { GrowthReferralService } from "./growth-referral.service";

@ApiTags("growth")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("growth")
export class GrowthReferralController {
  constructor(private readonly growth: GrowthReferralService) {}

  @Get("referral")
  @ApiOperation({ summary: "CR-09 referral code, link, and reward history" })
  referral(@CurrentUser() user: JwtUser) {
    return this.growth.getReferralHub(user);
  }
}