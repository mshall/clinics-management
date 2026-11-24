import { Body, Controller, Get, Param, Post, Put, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { RequiresSubscriptionAccess } from "../subscriptions/requires-subscription-access.decorator";
import { SubscriptionAccessAction } from "../subscriptions/subscription-access-policy";
import { SubscriptionAccessGuard } from "../subscriptions/subscription-access.guard";
import { TenantExportService } from "./tenant-export.service";
import { ExportsRequestPatientBodyDto, ExportsStartOffboardingBodyDto, ExportsLegalHoldBodyDto } from "./exports.controller.dto";

@ApiTags("exports")
@Controller("exports")
export class ExportsController {
  constructor(private readonly exports: TenantExportService) {}

  @Post("tenant")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "SC-05 — request full tenant data export (works while SUSPENDED)" })
  @ApiOkResponse()
  requestTenant(@CurrentUser() user: JwtUser) {
    return this.exports.requestTenantExport(requireTenantId(user), user);
  }

  @Post("patient")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "SC-05 — patient-level data subject export" })
  requestPatient(@CurrentUser() user: JwtUser, @Body() body: ExportsRequestPatientBodyDto) {
    return this.exports.requestPatientExport(requireTenantId(user), user, body.patientId);
  }

  @Get("offboarding")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  getOffboarding(@CurrentUser() user: JwtUser) {
    return this.exports.getOffboarding(requireTenantId(user), user);
  }

  @Post("offboarding")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  startOffboarding(@CurrentUser() user: JwtUser, @Body() body: ExportsStartOffboardingBodyDto) {
    return this.exports.startOffboarding(requireTenantId(user), user, body ?? {});
  }

  @Put("offboarding/legal-hold")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  legalHold(@CurrentUser() user: JwtUser, @Body() body: ExportsLegalHoldBodyDto) {
    return this.exports.setLegalHold(requireTenantId(user), user, Boolean(body?.legalHold));
  }

  @Get("download")
  @ApiOperation({ summary: "SC-05 — download export via expiring token" })
  async download(@Query("token") token?: string) {
    const result = await this.exports.downloadByToken(token?.trim() ?? "");
    return new StreamableFile(result.body, {
      type: result.contentType,
      disposition: `attachment; filename="${result.filename}"`,
    });
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "SC-05 — export job status" })
  getJob(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.exports.getJob(requireTenantId(user), id, user);
  }
}
