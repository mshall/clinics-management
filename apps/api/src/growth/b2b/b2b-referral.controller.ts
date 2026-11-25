import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { FeatureGuard, RequiresFeature } from "../../feature-flags/feature-flags-public";
import { B2bReferralService } from "./b2b-referral.service";
import { B2bReferralBodyDto } from "./b2b-referral.dto";

/** GRW-P4-C "Refer a company", web API. Reads work with `growth.provider_marketing_v2` OFF; sending needs it ON (403 FEATURE_DISABLED otherwise). */
@ApiTags("growth")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, FeatureGuard)
@Controller("growth/b2b-referrals")
export class B2bReferralController {
  constructor(private readonly svc: B2bReferralService) {}
  @Get() @ApiOperation({ summary: "Companies my organisation referred to Kiorex (tracking only, no reward)" })
  list(@CurrentUser() u: JwtUser) { return this.svc.list(u); }
  @Get(":id") @ApiOperation({ summary: "One company referral" })
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) { return this.svc.get(u, id); }
  @RequiresFeature("growth.provider_marketing_v2")
  @Post() @ApiOperation({ summary: "Refer a company to Kiorex (company name, size bucket, your own opaque contact reference; never a person's details)" })
  create(@CurrentUser() u: JwtUser, @Body() b: B2bReferralBodyDto) { return this.svc.create(u, b ?? {}); }
}
