import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UnauthorizedException,
  ForbiddenException,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthUserDto, LoginResponseDto } from "../common/dto/auth-responses.dto";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { CurrentUser } from "./current-user.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { HandoffExchangeDto, HandoffLoginDto } from "./dto/handoff.dto";
import { HandoffCodes, HandoffError, isHomeOrigin, webBaseUrl } from "./handoff";
import { PrismaHandoffStore } from "./handoff.store";
import { AuditService } from "../audit/audit.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtUser } from "./jwt-user";
import { AuthPasswordResetService } from "./auth-password-reset.service";
import { AuthOtpLoginService } from "./auth-otp-login.service";
import { AuthSessionService } from "./auth-session.service";
import { loginMetaFromRequest, clientIpFromRequest } from "./request-client-meta";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { AuthRefreshBodyDto, AuthForgotPasswordBodyDto, AuthResetPasswordBodyDto, AuthOtpRequestBodyDto, AuthOtpVerifyBodyDto, AuthConfirmMfaBodyDto, AuthDisableMfaBodyDto, AuthEnableWhatsAppMfaBodyDto, AuthWhatsappMfaChallengeBodyDto, AuthRegenerateMfaRecoveryBodyDto } from "./auth.controller.dto";

const AVATAR_UPLOAD_LIMIT = 5 * 1024 * 1024;

@ApiTags("auth")
@Controller("auth")
@UseGuards(PublicAuthRateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly passwordReset: AuthPasswordResetService,
    private readonly otpLogin: AuthOtpLoginService,
    private readonly sessions: AuthSessionService,
    private readonly handoffStore: PrismaHandoffStore,
    private readonly audit: AuditService,
  ) {}

  private handoffCodes() {
    return new HandoffCodes(this.handoffStore, "clinic");
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange credentials for a JWT" })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, dto.mfaCode, loginMetaFromRequest(req));
  }

  /**
   * Kiorly Home password sign-in, step 1 (ADR-038 handoff). Same credential, account and rate-limit checks as `login`, but the answer is a
   * single-use 30-second code (never a token) and where to send the browser. Only the Kiorly Home origin may call it (Origin allow-list).
   * A user with a second factor cannot complete here: the answer is `status: FALLBACK` with the product's own sign-in page (flag `reason=mfa`).
   */
  @Post("handoff/login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Kiorly Home: verify credentials, return a single-use handoff code" })
  async handoffLogin(@Body() dto: HandoffLoginDto, @Headers("origin") origin: string | undefined, @Req() req: Request) {
    req.res?.setHeader("Cache-Control", "no-store");
    if (!isHomeOrigin(origin)) {
      throw new ForbiddenException({ message: "This sign-in start is not allowed from here", errorCode: "HANDOFF_ORIGIN_NOT_ALLOWED" });
    }
    const v = await this.auth.verifyForHandoff(dto.email, dto.password);
    const web = webBaseUrl();
    const edition = dto.edition ?? null;
    const ed = edition ? `&edition=${edition}` : "";
    if (v.needsSecondFactor) {
      return { status: "FALLBACK", reason: "mfa", redirectUrl: web ? `${web}/login?from=kiorly-home&reason=mfa${ed}` : null };
    }
    const { code, expiresInSeconds } = await this.handoffCodes().issue({ subjectId: v.userId, origin: origin!, edition });
    if (v.tenantId) {
      void this.audit.recordEvent({ tenantId: v.tenantId, actorId: v.userId, clinicId: null, action: "HANDOFF_ISSUED", resource: "Auth", resourceId: v.userId, metadata: { via: "kiorly-home" } }).catch(() => undefined);
    }
    return { status: "OK", code, expiresInSeconds, redirectUrl: web ? `${web}/login?handoff=${encodeURIComponent(code)}&from=kiorly-home${ed}` : null };
  }

  /** Kiorly Home password sign-in, step 2: the Clinic web redeems the code once and receives the normal login result. Replays and expired codes: 401. */
  @Post("handoff/exchange")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: "Kiorly Home: redeem a handoff code for the normal session (single use)" })
  async handoffExchange(@Body() dto: HandoffExchangeDto, @Req() req: Request) {
    req.res?.setHeader("Cache-Control", "no-store");
    let subjectId: string;
    try {
      ({ subjectId } = await this.handoffCodes().redeem({ code: dto.code, edition: dto.edition ?? null }));
    } catch (e) {
      if (e instanceof HandoffError) throw new UnauthorizedException({ message: e.message, errorCode: e.code });
      throw e;
    }
    return this.auth.issueSsoSession(subjectId, undefined, loginMetaFromRequest(req));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate refresh token and issue a new access token" })
  refresh(@Body() body: AuthRefreshBodyDto) {
    return this.auth.refreshSession(body.refreshToken?.trim() ?? "");
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Request password reset via email link or WhatsApp OTP" })
  forgotPassword(@Body() body: AuthForgotPasswordBodyDto, @Req() req: Request) {
    return this.passwordReset.forgot(body, clientIpFromRequest(req));
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete password reset with token or phone OTP" })
  resetPassword(
    @Body() body: AuthResetPasswordBodyDto,
  ) {
    return this.passwordReset.reset(body);
  }

  @Post("otp/request")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Request login OTP (physicians)" })
  otpRequest(@Body() body: AuthOtpRequestBodyDto, @Req() req: Request) {
    return this.otpLogin.request(body.phone, clientIpFromRequest(req));
  }

  @Post("otp/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: "Verify login OTP and receive session" })
  otpVerify(
    @Body() body: AuthOtpVerifyBodyDto,
    @Req() req: Request,
  ) {
    return this.otpLogin.verify(body.phone, body.code, body.mfaCode, loginMetaFromRequest(req));
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "List active sessions for the current user" })
  listSessions(@CurrentUser() user: JwtUser) {
    return this.sessions.listSessions(user.userId, user.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Revoke a single session" })
  revokeSession(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.sessions.revokeSession(user.userId, id).then(() => ({ ok: true as const }));
  }

  @Post("sessions/revoke-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Sign out all devices (including this one)" })
  async revokeAllSessions(@CurrentUser() user: JwtUser) {
    const count = await this.sessions.revokeAllSessions(user.userId);
    return { ok: true as const, revoked: count };
  }

  @Post("mfa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Start TOTP MFA setup (returns secret + otpauth URL)" })
  beginMfa(@CurrentUser() user: JwtUser) {
    return this.mfa.beginSetup(user.userId, user.tenantId, user.email);
  }

  @Post("mfa/confirm")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Confirm MFA with a valid TOTP code" })
  confirmMfa(
    @CurrentUser() user: JwtUser,
    @Body() body: AuthConfirmMfaBodyDto,
  ) {
    return this.mfa.confirmSetup(user.userId, user.tenantId, body.secret, body.code);
  }

  @Post("mfa/disable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Disable MFA (password + current TOTP code)" })
  disableMfa(
    @CurrentUser() user: JwtUser,
    @Body() body: AuthDisableMfaBodyDto,
  ) {
    return this.mfa.disable(user.userId, user.tenantId, body.password, body.code);
  }

  @Post("mfa/whatsapp/enable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "SC-04 — enable WhatsApp OTP as MFA for physicians" })
  enableWhatsAppMfa(@CurrentUser() user: JwtUser, @Body() body: AuthEnableWhatsAppMfaBodyDto) {
    return this.mfa.enableWhatsAppMfa(user.userId, user.tenantId, body.password);
  }

  @Post("mfa/whatsapp/challenge")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "SC-04 — send WhatsApp MFA OTP (login second factor)" })
  whatsappMfaChallenge(@Body() body: AuthWhatsappMfaChallengeBodyDto, @Req() req: Request) {
    return this.mfa.requestWhatsAppMfaChallenge(body.userId, clientIpFromRequest(req));
  }

  @Post("mfa/recovery/regenerate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  regenerateMfaRecovery(
    @CurrentUser() user: JwtUser,
    @Body() body: AuthRegenerateMfaRecoveryBodyDto,
  ) {
    return this.mfa.regenerateRecoveryCodes(user.userId, user.tenantId, body.password, body.code);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Current user profile" })
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.userId, user.tenantId);
  }

  @Get("me/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Download your profile picture" })
  @ApiOkResponse({ description: "Binary image stream" })
  async getMyAvatar(@CurrentUser() user: JwtUser): Promise<StreamableFile> {
    const meta = await this.auth.getMyAvatarMeta(user.userId, user.tenantId);
    const stream = await this.auth.openAvatarReadStream(meta.storageKey);
    return new StreamableFile(stream, { type: meta.mimeType });
  }

  @Post("me/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Upload or replace your profile picture (image, max 5MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary", description: "Profile picture" },
      },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_UPLOAD_LIMIT },
    }),
  )
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean" }, hasAvatar: { type: "boolean" } } } })
  uploadMyAvatar(@CurrentUser() user: JwtUser, @UploadedFile() file?: Express.Multer.File) {
    return this.auth.attachMyAvatar(user.userId, user.tenantId, file);
  }

  @Delete("me/avatar")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Remove your profile picture" })
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean" }, hasAvatar: { type: "boolean" } } } })
  removeMyAvatar(@CurrentUser() user: JwtUser) {
    return this.auth.removeMyAvatar(user.userId, user.tenantId);
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Change your own password" })
  @ApiOkResponse({ schema: { properties: { ok: { type: "boolean", example: true } } } })
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, user.tenantId, dto.currentPassword, dto.newPassword);
  }
}
