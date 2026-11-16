import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CollectVisitBalanceDto } from "./dto/collect-visit-balance.dto";
import { FrontDeskCheckInDto } from "./dto/check-in.dto";
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

  @Post("appointments/:id/start-visit")
  startVisit(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.frontDesk.startVisitFromAppointment(requireTenantId(user), user, id);
  }

  @Post("appointments/:id/check-in")
  checkIn(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: FrontDeskCheckInDto) {
    return this.frontDesk.checkIn(requireTenantId(user), user, id, {
      paymentAmount: body.paymentAmount,
      roomLabel: body.roomLabel,
      currency: body.currency,
      visitCollection: body.toVisitCollectionInput(),
    });
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

  @Post("encounters/:encounterId/collect-visit-balance")
  collectVisitBalance(
    @CurrentUser() user: JwtUser,
    @Param("encounterId") encounterId: string,
    @Body() body: CollectVisitBalanceDto,
  ) {
    return this.frontDesk.collectVisitBalance(
      requireTenantId(user),
      user,
      encounterId,
      body.toVisitCollectionInput(),
    );
  }

  @Post("encounters/:encounterId/collect-visit-balance-with-receipt")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["receipt", "visitCollection"],
      properties: {
        receipt: { type: "string", format: "binary" },
        visitCollection: { type: "string", description: "JSON VisitCollectionDto" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("receipt", {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  collectVisitBalanceWithReceipt(
    @CurrentUser() user: JwtUser,
    @Param("encounterId") encounterId: string,
    @UploadedFile() receipt: Express.Multer.File | undefined,
    @Body("visitCollection") visitCollectionRaw?: string,
  ) {
    if (!receipt?.buffer?.length) throw new BadRequestException("receipt file is required");
    let parsed: CollectVisitBalanceDto;
    try {
      parsed = Object.assign(new CollectVisitBalanceDto(), JSON.parse(visitCollectionRaw ?? "{}"));
    } catch {
      throw new BadRequestException("visitCollection must be valid JSON");
    }
    return this.frontDesk.collectVisitBalance(
      requireTenantId(user),
      user,
      encounterId,
      parsed.toVisitCollectionInput(),
      receipt,
    );
  }
}
