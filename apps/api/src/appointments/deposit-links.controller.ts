import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import { FeatureGuard, RequiresFeature } from "../feature-flags/feature-flags-public";
import type { DepositPolicy } from "../markets/commercial-config.schema";
import { type CreateDepositLinkBody, DepositLinkService } from "./deposit-link.service";

/** FS-04 — deposits & payment links for high-risk bookings (Pro+). */
@ApiTags("appointments")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, EntitlementGuard, FeatureGuard)
@RequiresEntitlement("deposits")
@Controller()
export class DepositLinksController {
  constructor(private readonly links: DepositLinkService) {}

  @Get("appointments/:id/deposit-requirement")
  @ApiOperation({ summary: "Whether this booking needs a deposit (patient flag, no-shows, risk score, appointment type) and how much" })
  requirement(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.links.requirement(requireTenantId(user), id);
  }

  @RequiresFeature("clinic.kiorly_pay_deposits")
  @Post("appointments/:id/deposit-link")
  @ApiOperation({ summary: "Create a deposit payment link (clinic page or Kiorex Pay) and send it on WhatsApp" })
  createLink(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: CreateDepositLinkBody) {
    return this.links.createLink(requireTenantId(user), user, id, body ?? {});
  }

  @Get("clinics/:clinicId/deposit-policy")
  getPolicy(@CurrentUser() user: JwtUser, @Param("clinicId") clinicId: string) {
    return this.links.getPolicy(requireTenantId(user), clinicId);
  }

  @RequiresFeature("clinic.kiorly_pay_deposits")
  @Put("clinics/:clinicId/deposit-policy")
  @ApiOperation({ summary: "Override the market deposit policy for a clinic (null resets)" })
  updatePolicy(
    @CurrentUser() user: JwtUser,
    @Param("clinicId") clinicId: string,
    @Body() body: { policy: Partial<DepositPolicy> | null },
  ) {
    return this.links.updatePolicy(requireTenantId(user), user, clinicId, body);
  }
}
