import { Body, Controller, Get, HttpCode, HttpStatus, Optional, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { FeatureFlagsService, requireFeature } from "../feature-flags/feature-flags-public";
import { SignupService } from "./signup.service";

@ApiTags("public")
@Controller("public/signup")
@UseGuards(PublicAuthRateLimitGuard)
export class PublicSignupController {
  constructor(
    private readonly signup: SignupService,
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {}

  @Get("markets")
  @ApiOperation({ summary: "Live markets available for self-serve signup" })
  listMarkets() {
    return this.signup.listMarkets();
  }

  @Post("otp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send phone OTP for signup" })
  requestOtp(@Body() body: { phone: string; market: string }, @Req() req: Request) {
    const clientIp =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
        : undefined) || req.socket.remoteAddress;
    return this.signup.requestOtp(body, clientIp);
  }

  @Post("verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify OTP and receive signup token" })
  verify(@Body() body: { phone: string; code: string; market: string }) {
    return this.signup.verifyOtp(body);
  }

  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Provisioned clinic session (same shape as auth login)" })
  @ApiOperation({ summary: "Complete signup and receive session" })
  async complete(
    @Body()
    body: {
      signupToken: string;
      profile: { displayName: string; email: string; password: string };
      specialty: string;
      clinic: {
        nameEn: string;
        nameAr?: string;
        city: string;
        addressEn?: string;
        addressAr?: string;
        locationUrl?: string;
      };
      planKey: string;
      salesRepCode?: string;
      referralCode?: string;
      ref?: string;
      rep?: string;
      legalAcceptances?: { document: string; version: string }[];
    },
  ) {
    const { signupToken, profile, specialty, clinic, planKey, salesRepCode, referralCode, ref, rep, legalAcceptances } =
      body;
    // clinic.field_rep_onboarding OFF: rep codes are rejected at signup (global/market flag, no org yet).
    if ((salesRepCode ?? rep)?.trim() && this.flags) {
      await requireFeature(this.flags, null, "clinic.field_rep_onboarding");
    }
    return this.signup.complete(signupToken, {
      profile,
      specialty,
      clinic,
      planKey,
      salesRepCode: salesRepCode ?? rep,
      referralCode: referralCode ?? ref,
      legalAcceptances,
    });
  }
}