import { Injectable, Logger } from "@nestjs/common";
import { VerificationStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { resolveProfessionPack, type ProfessionPack } from "../scope-of-practice/profession-pack";
import { dueReminderStage, isReverificationOverdue } from "./profession-verification";
import { applyReverification } from "./reverify";

/**
 * PRVER03 — licence-expiry reminders and scheduled re-verification. Runs daily (see ProfessionReverificationScheduler).
 * Reminders are in-app staff notices (StaffInAppNotice) to the clinician and the organisation owner(s); no PHI.
 * A record past its next re-verification date moves to EXPIRED and drops off Kiorex until re-verified.
 */
@Injectable()
export class ProfessionReverificationService {
  private readonly log = new Logger(ProfessionReverificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async runDaily(now = new Date()): Promise<{ reminded: number; expired: number }> {
    const rows = await this.prisma.clinicianVerification.findMany({
      where: { status: VerificationStatus.VERIFIED, nextReverifyAt: { not: null } },
      include: {
        user: { select: { id: true, displayName: true } },
        tenant: { select: { market: { select: { code: true, clinicalConfig: true } } } },
      },
    });
    let reminded = 0;
    let expired = 0;
    for (const r of rows) {
      const pack: ProfessionPack = resolveProfessionPack(r.tenant.market);
      const next = r.nextReverifyAt!;
      if (isReverificationOverdue(next, now)) {
        const lapsed = await this.prisma.professionalRegistration.count({ where: { userId: r.userId, expiresAt: { lte: now } } });
        const reason = lapsed > 0 ? "LICENCE_EXPIRED" : "INTERVAL_ELAPSED";
        const done = await applyReverification(this.prisma, r.userId, reason);
        if (done) {
          expired++;
          await this.audit.recordEvent({
            tenantId: r.tenantId,
            actorId: null,
            clinicId: null,
            action: "clinician.verification.expired",
            resource: "ClinicianVerification",
            resourceId: r.id,
            metadata: { reason },
          });
          await this.notify(r.tenantId, r.userId, r.user.displayName, "expired", 0);
        }
        continue;
      }
      const due = dueReminderStage(pack, next, now, r.expiryReminderStage);
      if (!due) continue;
      await this.prisma.clinicianVerification.update({ where: { id: r.id }, data: { expiryReminderStage: due.stage } });
      await this.notify(r.tenantId, r.userId, r.user.displayName, "reminder", due.daysLeft);
      await this.audit.recordEvent({
        tenantId: r.tenantId,
        actorId: null,
        clinicId: null,
        action: "clinician.verification.expiry_reminder",
        resource: "ClinicianVerification",
        resourceId: r.id,
        metadata: { stage: due.stage, daysLeft: due.daysLeft },
      });
      reminded++;
    }
    if (reminded || expired) this.log.log(`PRVER03 re-verification: ${reminded} reminder(s), ${expired} expired`);
    return { reminded, expired };
  }

  private async notify(tenantId: string, userId: string, name: string, kind: "reminder" | "expired", daysLeft: number) {
    const owners = await this.prisma.user.findMany({
      where: { tenantId, isTenantOwner: true, deletedAt: null },
      select: { id: true },
    });
    const recipients = [...new Set([userId, ...owners.map((o) => o.id)])];
    const copy =
      kind === "expired"
        ? {
            titleEn: "Professional verification expired",
            titleAr: "انتهى التوثيق المهني",
            bodyEn: `${name}'s professional verification has lapsed. Re-submit the licence to be listed again.`,
            bodyAr: `انتهى التوثيق المهني لـ ${name}. أعد تقديم الترخيص ليظهر الملف من جديد.`,
          }
        : {
            titleEn: "Professional licence expires soon",
            titleAr: "ترخيص المهنة على وشك الانتهاء",
            bodyEn: `${name}'s licence needs re-verification in ${daysLeft} day(s).`,
            bodyAr: `يلزم إعادة توثيق ترخيص ${name} خلال ${daysLeft} يوم.`,
          };
    for (const uid of recipients) {
      await this.prisma.staffInAppNotice.create({
        data: { tenantId, userId: uid, kind: `prver.${kind}`, ...copy, metadata: { subjectUserId: userId, daysLeft } },
      });
    }
  }
}
