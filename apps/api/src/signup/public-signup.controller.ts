import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { SignupService } from "./signup.service";

@ApiTags("public")
@Controller("public/signup")
@UseGuards(PublicAuthRateLimitGuard)
export class PublicSignupController {
  constructor(private readonly signup: SignupService) {}

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
  complete(
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