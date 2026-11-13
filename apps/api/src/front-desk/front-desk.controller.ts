import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { FrontDeskService } from "./front-desk.service";

@ApiTags("front-desk")
@ApiBearerAuth("bearer")
@Controller("front-desk")
@UseGuards(JwtAuthGuard)
export class FrontDeskController {
  constructor(private readonly frontDesk: FrontDeskService) {}

  @Get("patients/search")
  search(@CurrentUser() user: JwtUser, @Query("q") q?: string) {
    return this.frontDesk.quickSearch(requireTenantId(user), user, q ?? "");
  }

  @Post("appointments/:id/check-in")
  checkIn(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { paymentAmount?: number; roomLabel?: string; currency?: string },
  ) {
    return this.frontDesk.checkIn(requireTenantId(user), user, id, body);
  }

  @Get("board")
  board(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.frontDesk.clinicBoard(requireTenantId(user), clinicId);
  }

  @Post("call-ticket")
  callTicket(@CurrentUser() user: JwtUser, @Body() body: { clinicId: string; ticketNumber: number }) {
    return this.frontDesk.callTicket(requireTenantId(user), body.clinicId, body.ticketNumber);
  }

  @Get("patients/:patientId/header-alerts")
  headerAlerts(@CurrentUser() user: JwtUser, @Param("patientId") patientId: string) {
    return this.frontDesk.patientHeaderAlerts(requireTenantId(user), patientId);
  }
}
