import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EntitlementGuard } from "../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../entitlements/requires-entitlement.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { CollectVisitBalanceDto } from "./dto/collect-visit-balance.dto";
import { FrontDeskCheckInDto } from "./dto/check-in.dto";
import { FrontDeskService } from "./front-desk.service";
import { FrontDeskCallTicketBodyDto, FrontDeskPutPrintSettingsBodyDto, FrontDeskPrintReceiptBodyDto } from "./front-desk.controller.dto";

@ApiTags("front-desk")
@ApiBearerAuth("bearer")
@Controller("front-desk")
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement("mod_front_desk")
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
      consentCapture: body.consentCapture,
    });
  }

  @Get("board")
  board(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.frontDesk.clinicBoard(requireTenantId(user), clinicId);
  }

  @Post("call-ticket")
  callTicket(@CurrentUser() user: JwtUser, @Body() body: FrontDeskCallTicketBodyDto) {
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

  @Get("print-settings")
  @ApiOperation({ summary: "UX-04 thermal printer profile for a clinic" })
  printSettings(@CurrentUser() user: JwtUser, @Query("clinicId") clinicId: string) {
    return this.frontDesk.getPrintSettings(requireTenantId(user), clinicId);
  }

  @Put("print-settings")
  @ApiOperation({ summary: "UX-04 save thermal printer profile" })
  putPrintSettings(
    @CurrentUser() user: JwtUser,
    @Body() body: FrontDeskPutPrintSettingsBodyDto,
  ) {
    return this.frontDesk.putPrintSettings(requireTenantId(user), body.clinicId, body.thermalPrinterProfileId);
  }

  @Get("print/queue-ticket")
  @ApiOperation({ summary: "UX-04 80 mm queue ticket PDF" })
  @ApiProduces("application/pdf")
  async printQueueTicket(
    @CurrentUser() user: JwtUser,
    @Query("clinicId") clinicId: string,
    @Query("ticketNumber") ticketNumber: string,
    @Query("patientName") patientName?: string,
    @Query("locale") locale?: "en" | "ar",
  ) {
    const result = await this.frontDesk.thermalQueueTicket(requireTenantId(user), {
      clinicId,
      ticketNumber: Number(ticketNumber),
      patientName,
      locale,
    });
    return new StreamableFile(result.pdf, {
      type: result.contentType,
      disposition: `inline; filename="${result.filename}"`,
    });
  }

  @Post("print/receipt")
  @ApiOperation({ summary: "UX-04 80 mm payment receipt PDF" })
  @ApiProduces("application/pdf")
  async printReceipt(
    @CurrentUser() user: JwtUser,
    @Body()
    body: FrontDeskPrintReceiptBodyDto,
  ) {
    const result = await this.frontDesk.thermalPaymentReceipt(requireTenantId(user), body);
    return new StreamableFile(result.pdf, {
      type: result.contentType,
      disposition: `inline; filename="${result.filename}"`,
    });
  }
}
