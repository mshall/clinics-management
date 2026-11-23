import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtUser } from "./jwt-user";
import { KiorexBackchannelDto, KiorexCallbackDto, KiorexCompleteDto, KiorexPasswordDto } from "./dto/kiorex-oidc.dto";
import { KiorexOidcService } from "./kiorex-oidc.service";
import { loginMetaFromRequest } from "./request-client-meta";
import { resolveEdition } from "../nurse/nurse-edition";
import { PrismaService } from "../prisma/prisma.service";
import { clinicDeploymentDefault, orgSignInFacts, resolvePublicSignInConfig } from "./sign-in-config";
import { makeWindowLimiter } from "./sign-in-default";

const configLimiter = makeWindowLimiter(300, 60_000);

/** KCV-201 — "Sign in with Kiorex Passport" alongside existing login (opt-in via KIOREX_OIDC_ISSUER). */
@ApiTags("auth")
@Controller("auth/kiorex")
export class KiorexOidcController {
  constructor(
    private readonly oidc: KiorexOidcService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("config")
  @ApiOperation({ summary: "Login page config: is Passport offered, which method is preselected (per ?org=<organisation id> or the deployment/edition default), uniform for unknown orgs" })
  async config(@Headers("x-forwarded-host") fwd?: string, @Headers("host") host?: string, @Query("org") org?: string, @Req() req?: Request) {
    const edition = resolveEdition({ host: fwd ?? host });
    // Pre-auth and public: rate limited per client; an unknown or missing org gets the deployment default in the same shape (no org enumeration).
    if (!configLimiter(req?.ip ?? "anon")) throw new HttpException({ message: "Too many requests", code: "RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
    const enabled = await this.oidc.isEnabled();
    const facts = org ? await orgSignInFacts(this.prisma, org) : null;
    const pub = resolvePublicSignInConfig({ passportAvailable: enabled, org: facts, deployment: clinicDeploymentDefault(edition) });
    // `defaultSignIn` is the legacy field (Nurse edition: KIOREX_PASSPORT); it now follows the resolved default.
    return { enabled, edition, defaultSignIn: pub.defaultMethod === "PASSPORT" ? "KIOREX_PASSPORT" : "PASSWORD", ...pub };
  }

  @Post("start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Start Kiorex Passport sign-in (auth code + PKCE); returns the authorization URL" })
  start(@Headers("x-forwarded-host") fwd?: string, @Headers("host") host?: string) {
    return this.oidc.startLogin(resolveEdition({ host: fwd ?? host }));
  }

  @Post("callback")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Exchange the authorization code; signs in a linked user or completes an account link" })
  callback(@Body() body: KiorexCallbackDto, @Req() req: Request) {
    return this.oidc.handleCallback(body ?? {}, loginMetaFromRequest(req));
  }

  @Post("complete")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PublicAuthRateLimitGuard)
  @ApiOperation({ summary: "Finish a Kiorex Passport sign-in that needs the MFA step-up code" })
  complete(@Body() body: KiorexCompleteDto, @Req() req: Request) {
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
  linkStart(@CurrentUser() user: JwtUser, @Body() body: KiorexPasswordDto) {
    return this.oidc.startLink(user.userId, body?.password ?? "");
  }

  @Post("link/remove")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  unlink(@CurrentUser() user: JwtUser, @Body() body: KiorexPasswordDto) {
    return this.oidc.unlink(user.userId, body?.password ?? "");
  }

  @Post("backchannel-logout")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "OIDC Back-Channel Logout receiver (logout_token, form-encoded)" })
  async backchannelLogout(@Body() body: KiorexBackchannelDto) {
    await this.oidc.backchannelLogout(body?.logout_token);
    return;
  }
}
