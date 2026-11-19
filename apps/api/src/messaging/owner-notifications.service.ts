import { forwardRef, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { DigestsService } from "./digests.service";
import { MessagingService } from "./messaging.service";

export const OWNER_SHIFT_SUMMARY_TEMPLATE_KEY = "owner_shift_summary";

export type ShiftClosedPayload = {
  shiftId: string;
  clinicId: string;
  zNumber: number;
  currency: string;
  expectedCash: number;
  countedCash: number;
  cashVariance: number;
  cardVariance: number;
  netCard: number;
  paymentCount: number;
  needsReview: boolean;
};

export type OwnerRecipient = { userId: string; displayName: string; phone: string };

/** WhatsApp notifications to tenant owners (staff, not patients — no patient consent applies). */
@Injectable()
export class OwnerNotificationsService {
  private readonly log = new Logger(OwnerNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
    @Optional() @Inject(forwardRef(() => DigestsService)) private readonly digests?: DigestsService,
  ) {}

  async ownerRecipients(tenantId: string): Promise<OwnerRecipient[]> {
    const owners = await this.prisma.user.findMany({
      where: { tenantId, isTenantOwner: true, deactivatedAt: null, deletedAt: null },
      select: { id: true, displayName: true, email: true, employee: { select: { phone: true } } },
    });
    const out: OwnerRecipient[] = [];
    for (const o of owners) {
      let phone = o.employee?.phone?.trim() || null;
      if (!phone) {
        const byEmail = await this.prisma.employee.findFirst({ where: { tenantId, email: o.email }, select: { phone: true } });
        phone = byEmail?.phone?.trim() || null;
      }
      if (phone) out.push({ userId: o.id, displayName: o.displayName, phone });
    }
    return out;
  }

  /** MN-03 — cash summary to owners after a shift closes. Returns the number of messages queued. */
  async shiftClosed(tenantId: string, p: ShiftClosedPayload): Promise<number> {
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) return 0;
    const clinic = await this.prisma.clinic.findFirst({ where: { id: p.clinicId, tenantId }, select: { nameEn: true } });
    const money = (n: number) => `${n.toFixed(2)} ${p.currency}`;
    const status = p.needsReview ? "REVIEW" : Math.abs(p.cashVariance) >= 0.01 ? "VARIANCE" : "OK";
    const market = await resolveMarketForTenant(this.prisma, tenantId);
    let queued = 0;
    for (const r of await this.ownerRecipients(tenantId)) {
      try {
        if (this.digests && !(await this.digests.maySendOwnerShift(r.userId, new Date(), market.timezone))) continue;
        await this.messaging.queueMessage(tenantId, {
          channel: MessageChannel.WHATSAPP,
          toPhone: r.phone,
          templateKey: OWNER_SHIFT_SUMMARY_TEMPLATE_KEY,
          body:
            `${clinic?.nameEn ?? ""} Z#${p.zNumber}: expected cash ${money(p.expectedCash)}, counted ${money(p.countedCash)}, ` +
            `variance ${money(p.cashVariance)}; card ${money(p.netCard)}; ${p.paymentCount} payments.` +
            (p.needsReview ? " Flagged for review." : ""),
          variables: {
            name: r.displayName,
            clinic: clinic?.nameEn ?? "",
            z: String(p.zNumber),
            expected: money(p.expectedCash),
            counted: money(p.countedCash),
            variance: money(p.cashVariance),
            card: money(p.netCard),
            status,
          },
          metadata: { kind: "owner_shift_summary", shiftId: p.shiftId, recipientUserId: r.userId },
        });
        queued += 1;
      } catch (e) {
        this.log.warn(`owner shift summary not queued: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return queued;
  }
}
