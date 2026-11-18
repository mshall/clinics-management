import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxDeliveryService } from "./outbox-delivery.service";
import {
  isDispatchableOutboxTarget,
  OUTBOX_DISPATCH_MAX_ATTEMPTS,
  OUTBOX_STATUS,
} from "./outbox-event-types";
import { notifyOnCall } from "../observability/notify-on-call";
import { outboxPendingLagExceedsAlert } from "./outbox-lag";

const BATCH_SIZE = 50;

function backoffMs(attempts: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.max(0, attempts));
}

@Injectable()
export class OutboxDispatcherService {
  private readonly log = new Logger(OutboxDispatcherService.name);
  lagAlertActive = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: OutboxDeliveryService,
  ) {}

  async processBatch(limit = BATCH_SIZE): Promise<{ processed: number; sent: number; failed: number }> {
    const now = new Date();
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.FAILED] },
        nextAttemptAt: { lte: now },
        OR: [{ target: "KIOREX" }, { target: { startsWith: "TENANT_WEBHOOK:" } }],
      },
      orderBy: [{ aggregateType: "asc" }, { aggregateId: "asc" }, { createdAt: "asc" }],
      take: limit,
    });

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      if (!isDispatchableOutboxTarget(row.target)) continue;
      const result = await this.deliverOne(row);
      if (result === "sent") sent += 1;
      if (result === "failed") failed += 1;
    }

    await this.evaluateLagAlert();
    return { processed: rows.length, sent, failed };
  }

  async retryEvent(eventId: string): Promise<{ ok: boolean }> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!row) return { ok: false };
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OUTBOX_STATUS.PENDING,
        nextAttemptAt: new Date(),
        ...(row.status === OUTBOX_STATUS.DEAD ? { attempts: 0 } : {}),
      },
    });
    const fresh = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    await this.deliverOne(fresh);
    return { ok: true };
  }

  async oldestPendingCreatedAt(): Promise<Date | null> {
    const row = await this.prisma.outboxEvent.findFirst({
      where: { status: OUTBOX_STATUS.PENDING },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  private async deliverOne(row: {
    id: string;
    tenantId: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    target: string;
    createdAt: Date;
    payload: unknown;
    attempts: number;
    status: string;
  }): Promise<"sent" | "failed" | "skipped"> {
    const claim = await this.prisma.outboxEvent.updateMany({
      where: {
        id: row.id,
        status: { in: [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.FAILED] },
      },
      data: { status: OUTBOX_STATUS.PENDING },
    });
    if (claim.count === 0) return "skipped";

    const result = await this.delivery.deliver(row);
    if (result.ok) {
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: OUTBOX_STATUS.SENT, sentAt: new Date(), attempts: row.attempts + 1 },
      });
      return "sent";
    }

    const attempts = row.attempts + 1;
    const dead = !result.retryable || attempts >= OUTBOX_DISPATCH_MAX_ATTEMPTS;
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: dead ? OUTBOX_STATUS.DEAD : OUTBOX_STATUS.FAILED,
        attempts,
        nextAttemptAt: dead ? row.createdAt : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    if (dead) {
      this.log.warn(`Outbox DEAD ${row.id} ${row.type}: ${result.message}`);
    }
    return "failed";
  }

  private async evaluateLagAlert(): Promise<void> {
    const oldest = await this.oldestPendingCreatedAt();
    const lagging = outboxPendingLagExceedsAlert(oldest);
    if (lagging && !this.lagAlertActive) {
      this.log.error(`Outbox lag alert: oldest PENDING > 2 minutes (${oldest?.toISOString()})`);
      notifyOnCall("OUTBOX_PENDING_LAG", {
        oldestPendingAt: oldest?.toISOString(),
        message: "Outbox PENDING lag exceeded threshold",
      });
      this.lagAlertActive = true;
    }
    if (!lagging) this.lagAlertActive = false;
  }
}