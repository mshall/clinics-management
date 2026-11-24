import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../../feature-flags/feature-flags-public";
import { B2bReferralService } from "./b2b-referral.service";
import { B2bReferralBodyDto } from "./b2b-referral.dto";

/** GRW-P4-C staff app: "Refer a company" (`/mobile/*` is plan-gated by MobilePlanGuard; roles by the Growth matrix in the service). Sending needs `growth.provider_marketing_v2`. */
@ApiTags("mobile")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("mobile/growth/b2b-referrals")
export class B2bMobileController {
  constructor(private readonly svc: B2bReferralService) {}
  @Get() @ApiOperation({ summary: "Companies my organisation referred (tracking only)" })
  list(@CurrentUser() u: JwtUser) { return this.svc.list(u); }
  @RequiresFeature("growth.provider_marketing_v2")
  @Post() @HttpCode(200) @ApiOperation({ summary: "Refer a company to Kiorex" })
  create(@CurrentUser() u: JwtUser, @Body() b: B2bReferralBodyDto) { return this.svc.create(u, b ?? {}); }
}
