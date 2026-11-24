import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BadRequestException } from "@nestjs/common";
import { AppointmentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AppointmentRescheduleTokenService } from "./appointment-reschedule-token.service";
import { PublicAppointmentRescheduleApplyBodyDto } from "./public-appointment-reschedule.controller.dto";

@ApiTags("public")
@Controller("public/appointments/reschedule")
export class PublicAppointmentRescheduleController {
  constructor(
    private readonly tokens: AppointmentRescheduleTokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(":token")
  @ApiOperation({ summary: "KX-09 — public reschedule slot picker context" })
  summary(@Param("token") token: string) {
    return this.tokens.publicSummary(token);
  }

  @Post(":token")
  @ApiOperation({ summary: "Apply a new startsAt from the public reschedule page" })
  async apply(@Param("token") token: string, @Body() body: PublicAppointmentRescheduleApplyBodyDto) {
    const raw = body.startsAt?.trim();
    if (!raw) throw new BadRequestException("startsAt is required");
    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) throw new BadRequestException("Invalid startsAt");

    const { tenantId, appointmentId } = await this.tokens.resolveAppointmentId(token);
    const apt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, tenantId } });
    if (!apt) throw new BadRequestException("Appointment not found");
    if (apt.status === AppointmentStatus.CANCELLED || apt.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Appointment cannot be rescheduled");
    }

    const durationMs = apt.endsAt ? apt.endsAt.getTime() - apt.startsAt.getTime() : 30 * 60_000;
    const endsAt = new Date(start.getTime() + Math.max(durationMs, 15 * 60_000));

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        startsAt: start,
        endsAt,
        status: AppointmentStatus.SCHEDULED,
        whatsappConfirmedAt: null,
      },
    });
    await this.tokens.markUsed(token);
    return { ok: true, startsAt: start.toISOString(), endsAt: endsAt.toISOString() };
  }
}