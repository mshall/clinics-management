import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexConnectService } from "./kiorex-connect.service";

/** Organisation-facing "Connect to Kiorex" wizard (ADR-040): a step checklist computed from real state, plus consent and Request to go live. */
@ApiTags("kiorex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kiorex/connect")
export class KiorexConnectController {
  constructor(private readonly connect: KiorexConnectService) {}

  @Get()
  @ApiOperation({ summary: "Connect to Kiorex checklist: per-step status (done / action_needed / waiting_kiorex / blocked) with deep links, per-doctor progress" })
  get(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) { return this.connect.get(user, clinicId); }

  @Put("consent")
  @ApiOperation({ summary: "Accept the marketplace terms and the fee acknowledgement (group admin / clinic admin)" })
  consent(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string; termsVersion: string; feeAcknowledged: boolean }) { return this.connect.acceptTerms(user, body); }

  @Post("request")
  @HttpCode(200)
  @ApiOperation({ summary: "Request to go live: listings DRAFT -> PENDING_VERIFICATION, then LIVE once Kiorex ops approves" })
  request(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string }) { return this.connect.requestLive(user, body.clinicId); }

  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Refresh the Kiorex decision now" })
  refresh(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string }) { return this.connect.get(user, body.clinicId); }
}
