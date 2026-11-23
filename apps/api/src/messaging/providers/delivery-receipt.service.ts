import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../email.service";
import type { DeliveryReceipt } from "./delivery-receipt";

const RANK: Record<string, number> = { QUEUED: 0, RETRY: 0, SENT: 1, DELIVERED: 2, READ: 3 };

/** Persists neutral delivery receipts (SMS / WhatsApp via OutboundMessage, Email via EmailMessage). Idempotent and monotonic. */
@Injectable()
export class DeliveryReceiptService {
  private readonly log = new Logger(DeliveryReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async apply(kind: "sms" | "whatsapp" | "email", receipts: DeliveryReceipt[]): Promise<{ received: number; updated: number; unknown: number }> {
    let updated = 0;
    let unknown = 0;
    for (const r of receipts) {
      const ok = kind === "email" ? await this.applyEmail(r) : await this.applyOutbound(r);
      if (ok === null) unknown += 1;
      else if (ok) updated += 1;
    }
    return { received: receipts.length, updated, unknown };
  }

  private async applyOutbound(r: DeliveryReceipt): Promise<boolean | null> {
    const row = await this.prisma.outboundMessage.findFirst({ where: { providerMessageId: r.providerMessageId } });
    if (!row) return null;
    const at = r.at ?? new Date();
    const data: Record<string, unknown> = {};
    if (r.status === "sent") {
      if ((RANK[row.status] ?? 0) >= 1) return false;
      data.status = "SENT";
    } else if (r.status === "delivered") {
      if ((RANK[row.status] ?? 0) >= 2) return false;
      Object.assign(data, { status: "DELIVERED", deliveredAt: at });
    } else if (r.status === "read") {
      if (row.status === "READ") return false;
      Object.assign(data, { status: "READ", readAt: at, deliveredAt: row.deliveredAt ?? at });
    } else {
      if (row.status === "FAILED") return false;
      Object.assign(data, { status: "FAILED", error: (r.error ?? "Provider reported failure").slice(0, 500), failureClass: "POLICY" });
    }
    await this.prisma.outboundMessage.update({ where: { id: row.id }, data });
    if (data.status === "FAILED") {
      await this.audit.recordEvent({
        tenantId: row.tenantId,
        actorId: null,
        clinicId: null,
        action: `${row.channel}_DELIVERY_FAILED`,
        resource: "OutboundMessage",
        resourceId: row.id,
        metadata: { providerMessageId: r.providerMessageId, error: data.error },
      });
    }
    return true;
  }

  private async applyEmail(r: DeliveryReceipt): Promise<boolean | null> {
    const row = await this.prisma.emailMessage.findFirst({ where: { providerMessageId: r.providerMessageId } });
    if (!row) return null;
    if (r.status === "bounced" || r.status === "failed") {
      if (row.status === "BOUNCED") return false;
      await this.email.recordBounce({ providerMessageId: r.providerMessageId, bounceType: r.status === "bounced" ? "Permanent" : "Failed", diagnostic: r.error });
      return true;
    }
    if (r.status === "delivered" || r.status === "read") {
      if (row.status === "DELIVERED" || row.status === "BOUNCED") return false;
      await this.prisma.emailMessage.update({ where: { id: row.id }, data: { status: "DELIVERED" } });
      return true;
    }
    return false;
  }
}
