import { Body, Controller, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FiscalDeviceStatus } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const EVENT_STATUS: Record<string, FiscalDeviceStatus> = {
  POS_DEVICE_CREDENTIALS_EXPIRATION: FiscalDeviceStatus.CREDENTIALS_EXPIRED,
  POS_DEVICE_DEACTIVATED: FiscalDeviceStatus.DEACTIVATED,
  POS_DEVICE_UNUSED: FiscalDeviceStatus.SUSPENDED,
};

function apiKeyMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@ApiTags("integrations-fiscal")
@Controller("integrations/fiscal/eta-egypt")
export class FiscalEtaNotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertApiKey(header: string | undefined): void {
    const expected = process.env.ETA_NOTIFICATION_API_KEY?.trim();
    const auth = header?.trim() ?? "";
    const token = auth.replace(/^ApiKey\s+/i, "").trim();
    if (!expected || !token || !apiKeyMatches(expected, token)) {
      throw new UnauthorizedException("Invalid notification API key");
    }
  }

  @Post("notifications/ping")
  @ApiOperation({ summary: "ETA visibility ping" })
  ping(@Headers("authorization") auth: string) {
    this.assertApiKey(auth);
    return { ok: true, service: "kiorly-fiscal-notifications" };
  }

  @Post("notifications/:tenantId")
  @ApiOperation({ summary: "ETA general notifications webhook (tenant from URL path)" })
  async notifications(
    @Headers("authorization") auth: string,
    @Param("tenantId") tenantIdParam: string,
    @Body()
    body: {
      serialNumber?: string;
      eventType?: string;
      message?: string;
    },
  ) {
    this.assertApiKey(auth);
    const tenantId = tenantIdParam?.trim();
    if (!tenantId) throw new UnauthorizedException("tenantId required in URL");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return { ok: true, ignored: true };

    const serial = body.serialNumber?.trim();
    if (!serial) return { ok: true, ignored: true };

    const device = await this.prisma.fiscalDevice.findFirst({
      where: { tenantId, serialNumber: serial },
    });
    if (!device) return { ok: true, ignored: true };

    const nextStatus = body.eventType ? EVENT_STATUS[body.eventType] : undefined;
    if (nextStatus) {
      await this.prisma.fiscalDevice.update({
        where: { id: device.id },
        data: {
          status: nextStatus,
          statusReason: body.message?.slice(0, 500) ?? body.eventType,
        },
      });
      await this.audit.recordEvent({
        tenantId,
        actorId: null,
        clinicId: device.clinicId,
        action: "ETA_DEVICE_NOTIFICATION",
        resource: "fiscal_device",
        resourceId: device.id,
        metadata: { eventType: body.eventType, message: body.message },
      });
    }
    return { ok: true };
  }
}