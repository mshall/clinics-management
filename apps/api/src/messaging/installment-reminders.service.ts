import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MessageChannel } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { canHandlePatientMoney } from "../billing/patient-money";
import { installmentReminderDaysBefore, localDate } from "../billing/split-payment";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "./messaging.service";

export const INSTALLMENT_REMINDER_TEMPLATE_KEY = "installment_due_reminder";

const SCAN_MS = 60 * 60_000;

/** MN-06 — WhatsApp reminder to the patient before an operation installment is due (once automatically; desk can resend). */
@Injectable()
export class InstallmentRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(InstallmentRemindersService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.sendDue().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Unpaid installments due within the market's reminder window that were never reminded. */
  async sendDue(now = new Date(), filter: { tenantId?: string } = {}): Promise<{ sent: number; skipped: number }> {
    const horizon = new Date(now.getTime() + 31 * 86_400_000);
    const candidates = await this.prisma.operationInstallment.findMany({
      where: { paidAt: null, reminderSentAt: null, dueOn: { lte: horizon }, ...(filter.tenantId ? { tenantId: filter.tenantId } : {}) },
      select: { id: true, tenantId: true, dueOn: true },
      take: 500,
    });
    let sent = 0;
    let skipped = 0;
    const windows = new Map<string, { today: string; last: string } | null>();
    for (const c of candidates) {
      if (!windows.has(c.tenantId)) {
        if (!(await this.featureFlags.isEnabled(c.tenantId, "whatsapp_reminders"))) windows.set(c.tenantId, null);
        else {
          const market = await resolveMarketForTenant(this.prisma, c.tenantId);
          const today = localDate(now, market.timezone);
          const last = new Date(`${today}T00:00:00Z`);
          last.setUTCDate(last.getUTCDate() + installmentReminderDaysBefore(market.providerConfig));
          windows.set(c.tenantId, { today, last: last.toISOString().slice(0, 10) });
        }
      }
      const w = windows.get(c.tenantId);
      const due = c.dueOn.toISOString().slice(0, 10);
      if (!w || due > w.last || due < w.today) {
        skipped += 1;
        continue;
      }
      try {
        await this.sendOne(c.tenantId, c.id);
        sent += 1;
      } catch (e) {
        skipped += 1;
        this.log.warn(`installment reminder ${c.id} not sent: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { sent, skipped };
  }

  async sendManual(tenantId: string, user: JwtUser, installmentId: string) {
    if (!canHandlePatientMoney(user)) throw new ForbiddenException("Your role cannot send payment reminders");
    if (!(await this.featureFlags.isEnabled(tenantId, "whatsapp_reminders"))) {
      throw new BadRequestException({ message: "WhatsApp is not enabled for this clinic", code: "WHATSAPP_DISABLED" });
    }
    return this.sendOne(tenantId, installmentId, user.userId);
  }

  private async sendOne(tenantId: string, installmentId: string, actorId?: string) {
    const inst = await this.prisma.operationInstallment.findFirst({
      where: { id: installmentId, tenantId },
      include: {
        operation: {
          select: {
            clinicId: true,
            feeCurrency: true,
            patientId: true,
            patient: { select: { firstNameEn: true, phone: true } },
            clinic: { select: { nameEn: true } },
          },
        },
      },
    });
    if (!inst) throw new NotFoundException("Installment not found");
    if (inst.paidAt) throw new ConflictException({ message: "Installment already paid", code: "INSTALLMENT_PAID" });
    const phone = inst.operation.patient.phone?.trim();
    if (!phone) throw new BadRequestException({ message: "Patient has no phone number", code: "NO_PHONE" });
    const amount = `${Number(inst.amount).toFixed(2)} ${inst.operation.feeCurrency}`;
    const date = inst.dueOn.toISOString().slice(0, 10);
    const msg = await this.messaging.queueMessage(tenantId, {
      patientId: inst.operation.patientId,
      channel: MessageChannel.WHATSAPP,
      toPhone: phone,
      templateKey: INSTALLMENT_REMINDER_TEMPLATE_KEY,
      body: `Reminder: an installment of ${amount} is due on ${date} at ${inst.operation.clinic.nameEn}.`,
      variables: { name: inst.operation.patient.firstNameEn, clinic: inst.operation.clinic.nameEn, amount, date },
      metadata: { kind: "installment_reminder", installmentId, manual: Boolean(actorId) },
    });
    const sentAt = new Date();
    await this.prisma.operationInstallment.update({ where: { id: installmentId }, data: { reminderSentAt: sentAt } });
    return { installmentId, messageId: (msg as { id?: string }).id ?? null, reminderSentAt: sentAt.toISOString() };
  }
}
