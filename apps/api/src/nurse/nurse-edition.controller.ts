import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PublicAuthRateLimitGuard } from "../common/rate-limit.guard";
import { SignupService } from "../signup/signup.service";
import { FamilyUpdateService } from "./family-update.service";
import { NurseEditionService } from "./nurse-edition.service";
import { NurseEditionCompleteBodyDto, NurseEditionChangeEditionBodyDto } from "./nurse-edition.controller.dto";

@ApiTags("public")
@Controller("public/nurse")
export class NursePublicController {
  constructor(
    private readonly edition: NurseEditionService,
    private readonly signup: SignupService,
    private readonly family: FamilyUpdateService,
  ) {}

  /** KNED02/KNED01 — edition by Host for login / sign-up surfaces (nurse.kiorly.com => NURSE; "Sign in with Kiorex Passport" is the Nurse default). */
  @Get("edition")
  editionByHost(@Headers("x-forwarded-host") fwd?: string, @Headers("host") host?: string) {
    return this.edition.publicEdition(fwd ?? host);
  }

  @Get("plans")
  plans() {
    return this.edition.publicPlans();
  }

  /** KNED01 — Nurse sign-up (phone OTP steps are the shared `/public/signup/otp` and `/verify`). New sign-ups are flag-gated (nurse.edition, nurse.individual_tenants). */
  @Post("signup/complete")
  @HttpCode(200)
  @UseGuards(PublicAuthRateLimitGuard)
  async complete(
    @Body()
    body: NurseEditionCompleteBodyDto,
  ) {
    const kind = body.kind === "AGENCY" ? "AGENCY" : "SOLO";
    await this.edition.assertSignupAllowed(kind);
    return this.signup.complete(body.signupToken, {
      profile: body.profile,
      specialty: "GENERAL_MEDICINE",
      clinic: { nameEn: body.practice.nameEn, nameAr: body.practice.nameAr, city: body.practice.city },
      planKey: body.planKey,
      legalAcceptances: body.legalAcceptances,
      edition: "NURSE",
      nurseKind: kind,
    });
  }

  /** KNFAM01 — family summary page data (token-gated, minimal). */
  @Get("family/:token")
  familySummary(@Param("token") token: string) {
    return this.family.publicSummary(token);
  }
}

@ApiTags("nurse")
@ApiBearerAuth("bearer")
@Controller("nurse")
@UseGuards(JwtAuthGuard)
export class NurseEditionController {
  constructor(private readonly edition: NurseEditionService) {}

  @Get("context")
  context(@CurrentUser() u: JwtUser, @Headers("x-forwarded-host") fwd?: string, @Headers("host") host?: string) {
    return this.edition.context(requireTenantId(u), fwd ?? host);
  }

  @Get("onboarding")
  onboarding(@CurrentUser() u: JwtUser) {
    return this.edition.onboarding(requireTenantId(u), u);
  }

  /** KNED04 — Kiorex super admin only (403 EDITION_CHANGE_FORBIDDEN for everyone else, including organization owners). */
  @Put("platform/tenants/:tenantId/edition")
  changeEdition(@CurrentUser() u: JwtUser, @Param("tenantId") tenantId: string, @Body() body: NurseEditionChangeEditionBodyDto) {
    return this.edition.changeEdition(u, tenantId, body.edition, body.kind);
  }
}
