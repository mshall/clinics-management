import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtUser } from "./jwt-user";
import { KiorexOidcService } from "./kiorex-oidc.service";
import { loginMetaFromRequest } from "./request-client-meta";

/** KCV-201 — "Sign in with Kiorex Passport" alongside existing login (opt-in via KIOREX_OIDC_ISSUER). */
@ApiTags("auth")
@Controller("auth/kiorex")
export class KiorexOidcController {
  constructor(private readonly oidc: KiorexOidcService) {}

  @Get("config")
  @ApiOperation({ summary: "Whether the Sign in with Kiorex Passport button should be shown" })
  async config() {
    return { enabled: await this.oidc.isEnabled() };
  }

  @Post("start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Start Kiorex Passport sign-in (auth code + PKCE); returns the authorization URL" })
  start() {
    return this.oidc.startLogin();
  }

  @Post("callback")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Exchange the authorization code; signs in a linked user or completes an account link" })
  callback(@Body() body: { code?: string; state?: string; iss?: string }, @Req() req: Request) {
    return this.oidc.handleCallback(body ?? {}, loginMetaFromRequest(req));
  }

  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Finish a Kiorex Passport sign-in that needs the MFA step-up code" })
  complete(@Body() body: { ticket?: string; mfaCode?: string }, @Req() req: Request) {
    return this.oidc.completeWithMfa(body?.ticket ?? "", body?.mfaCode ?? "", loginMetaFromRequest(req));
  }

  @Get("link")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  linkStatus(@CurrentUser() user: JwtUser) {
    return this.oidc.linkStatus(user.userId);
  }

  @Post("link/start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Start linking this Kiorly user to a Kiorex Passport (requires password re-authentication)" })
  linkStart(@CurrentUser() user: JwtUser, @Body() body: { password?: string }) {
    return this.oidc.startLink(user.userId, body?.password ?? "");
  }

  @Post("link/remove")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  unlink(@CurrentUser() user: JwtUser, @Body() body: { password?: string }) {
    return this.oidc.unlink(user.userId, body?.password ?? "");
  }

  @Post("backchannel-logout")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "OIDC Back-Channel Logout receiver (logout_token, form-encoded)" })
  async backchannelLogout(@Body() body: { logout_token?: string }) {
    await this.oidc.backchannelLogout(body?.logout_token);
    return;
  }
}
