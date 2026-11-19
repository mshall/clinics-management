import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EmailOutboxService } from "./email-outbox.service";
import { OUTBOX_DISPATCH_MAX_ATTEMPTS, OUTBOX_STATUS, OUTBOX_TARGET_INTERNAL } from "./outbox-event-types";
import { OwnerNotificationsService, type ShiftClosedPayload } from "./owner-notifications.service";

const SCAN_MS = 30_000;
const LEASE_MS = 5 * 60_000;

type Handler = (tenantId: string, payload: unknown) => Promise<unknown>;

/** Delivers INTERNAL outbox topics that engagement owns (e.g. owner shift summary, MS-05 email). Unknown topics are left untouched. */
@Injectable()
export class InternalOutboxConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(InternalOutboxConsumerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly handlers: Record<string, Handler>;

  constructor(
    private readonly prisma: PrismaService,
    owners: OwnerNotificationsService,
    @Optional() emailOutbox?: EmailOutboxService,
  ) {
    this.handlers = {
      "billing.shift_closed": (tenantId, payload) => owners.shiftClosed(tenantId, payload as ShiftClosedPayload),
    };
    if (emailOutbox) {
      this.handlers["billing.trial_notification"] = (tenantId, payload) =>
        emailOutbox.deliverTrialNotification(tenantId, payload);
      this.handlers["billing.monthly_statement_ready"] = (tenantId, payload) =>
        emailOutbox.deliverStatementReady(tenantId, payload);
    }
  }

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.processBatch().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  topics(): string[] {
    return Object.keys(this.handlers);
  }

  async processBatch(limit = 50, filter: { tenantId?: string } = {}): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        target: OUTBOX_TARGET_INTERNAL,
        type: { in: this.topics() },
        status: { in: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.FAILED] },
        nextAttemptAt: { lte: now },
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const claim = await this.prisma.outboxEvent.updateMany({
        where: { id: row.id, status: row.status, nextAttemptAt: row.nextAttemptAt },
        data: { nextAttemptAt: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } },
      });
      if (claim.count === 0) continue;
      try {
        await this.handlers[row.type]!(row.tenantId, row.payload);
        await this.prisma.outboxEvent.update({ where: { id: row.id }, data: { status: OUTBOX_STATUS.SENT, sentAt: new Date() } });
        sent += 1;
      } catch (e) {
        const attempts = row.attempts + 1;
        const dead = attempts >= OUTBOX_DISPATCH_MAX_ATTEMPTS;
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: dead ? OUTBOX_STATUS.DEAD : OUTBOX_STATUS.FAILED,
            nextAttemptAt: new Date(Date.now() + Math.min(300_000, 1_000 * 2 ** attempts)),
          },
        });
        this.log.warn(`internal outbox ${row.type} ${row.id} failed: ${e instanceof Error ? e.message : String(e)}`);
        failed += 1;
      }
    }
    return { processed: rows.length, sent, failed };
  }
}
