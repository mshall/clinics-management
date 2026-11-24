import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { KiorexFrontDoorService } from "./kiorex-front-door.service";
import type { TalkToUsInput } from "./kiorex-front-door.logic";

/** State-aware front door of the Kiorex tab (ADR-040). Owner / admin only (same guard as the Connect wizard). */
@ApiTags("kiorex")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("kiorex/front-door")
export class KiorexFrontDoorController {
  constructor(private readonly svc: KiorexFrontDoorService) {}
  @Get() @ApiOperation({ summary: "Front-door state (NOT_CONNECTED, IN_PROGRESS, WAITING, LIVE, ATTENTION) with recent Kiorex bookings for the live dashboard" })
  get(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) { return this.svc.get(user, clinicId); }
  @Post("interest") @HttpCode(200) @ApiOperation({ summary: "Privacy-safe funnel marker: the standalone organisation viewed the Kiorex tab (once)" })
  interest(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string }) { return this.svc.interest(user, body?.clinicId); }
  @Post("start") @HttpCode(200) @ApiOperation({ summary: "Start connecting: remember it and mark the funnel" })
  start(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string }) { return this.svc.start(user, body?.clinicId); }
  @Post("talk") @HttpCode(200) @ApiOperation({ summary: "Talk to us: send a signed lead (name, role, phone/e-mail, preferred time, note, consent) to Kiorex" })
  talk(@CurrentUser() user: JwtUser, @Body() body: TalkToUsInput & { clinicId: string }) { return this.svc.talk(user, body?.clinicId, body); }
}
