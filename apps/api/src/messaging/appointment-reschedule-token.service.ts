import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN_TTL_MS = 7 * 86_400_000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

@Injectable()
export class AppointmentRescheduleTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async mintForAppointment(tenantId: string, appointmentId: string): Promise<string> {
    const raw = randomBytes(24).toString("base64url");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.prisma.appointmentRescheduleToken.upsert({
      where: { appointmentId },
      create: { tenantId, appointmentId, tokenHash, expiresAt },
      update: { tokenHash, expiresAt, usedAt: null },
    });
    return raw;
  }

  async resolveAppointmentId(rawToken: string): Promise<{ tenantId: string; appointmentId: string }> {
    const row = await this.prisma.appointmentRescheduleToken.findUnique({
      where: { tokenHash: hashToken(rawToken.trim()) },
    });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Reschedule link expired or invalid");
    }
    return { tenantId: row.tenantId, appointmentId: row.appointmentId };
  }

  async markUsed(rawToken: string): Promise<void> {
    const hash = hashToken(rawToken.trim());
    await this.prisma.appointmentRescheduleToken.updateMany({
      where: { tokenHash: hash, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  rescheduleUrl(rawToken: string): string {
    const base = process.env.APP_WEB_URL?.trim() || "http://localhost:5173";
    return `${base.replace(/\/$/, "")}/r/${encodeURIComponent(rawToken)}`;
  }

  async publicSummary(rawToken: string) {
    const { tenantId, appointmentId } = await this.resolveAppointmentId(rawToken);
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        clinic: { select: { nameEn: true, nameAr: true, timezone: true } },
        patient: { select: { firstNameEn: true, lastNameEn: true } },
      },
    });
    if (!apt) throw new NotFoundException("Appointment not found");
    if (apt.status === "CANCELLED" || apt.status === "COMPLETED") {
      throw new UnauthorizedException("This appointment can no longer be rescheduled");
    }
    return {
      appointmentId: apt.id,
      clinicNameEn: apt.clinic.nameEn,
      clinicNameAr: apt.clinic.nameAr,
      patientName: `${apt.patient.firstNameEn} ${apt.patient.lastNameEn}`.trim(),
      startsAt: apt.startsAt.toISOString(),
      endsAt: apt.endsAt?.toISOString() ?? null,
      timezone: apt.clinic.timezone,
      status: apt.status,
    };
  }
}