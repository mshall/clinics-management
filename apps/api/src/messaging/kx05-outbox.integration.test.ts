import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxEventService } from "./outbox-event.service";
import { OutboxDeliveryService } from "./outbox-delivery.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OUTBOX_EVENT, OUTBOX_STATUS } from "./outbox-event-types";

const prisma = new PrismaClient();

describe("KX-05 transactional outbox dispatcher", () => {
  let tenantId: string;

  before(async () => {
    await prisma.$connect();
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    assert.ok(tenant);
    tenantId = tenant.id;
  });

  after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { tenantId, type: OUTBOX_EVENT.SLOTS_CHANGED } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("leaves event retryable after failed delivery (worker interrupted)", async () => {
    const prismaSvc = prisma as unknown as PrismaService;
    const outbox = new OutboxEventService(prismaSvc);
    const prevUrl = process.env.KIOREX_OUTBOX_WEBHOOK_URL;
    const prevSecret = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET;
    process.env.KIOREX_OUTBOX_WEBHOOK_URL = "http://127.0.0.1:9/unreachable";
    process.env.KIOREX_OUTBOX_WEBHOOK_SECRET = "test-secret";

    const eventId = await outbox.enqueueEvent({
      tenantId,
      type: OUTBOX_EVENT.SLOTS_CHANGED,
      aggregateType: "Clinic",
      aggregateId: "clinic-dispatch-test",
      payload: { clinicId: "clinic-dispatch-test", reason: "kx05-test" },
    });

    const dispatcher = new OutboxDispatcherService(prismaSvc, new OutboxDeliveryService(prismaSvc));
    const batch = await dispatcher.processBatch(5);
    assert.ok(batch.processed >= 1);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    assert.notEqual(row.status, OUTBOX_STATUS.SENT);
    assert.ok(row.attempts >= 1);
    assert.equal(row.status, OUTBOX_STATUS.FAILED);

    process.env.KIOREX_OUTBOX_WEBHOOK_URL = prevUrl;
    process.env.KIOREX_OUTBOX_WEBHOOK_SECRET = prevSecret;

    await prisma.outboxEvent.delete({ where: { id: eventId } }).catch(() => undefined);
  });

  it("marks KIOREX events SENT when no URL configured (noop) without losing row", async () => {
    const prismaSvc = prisma as unknown as PrismaService;
    const outbox = new OutboxEventService(prismaSvc);
    const prevUrl = process.env.KIOREX_OUTBOX_WEBHOOK_URL;
    delete process.env.KIOREX_OUTBOX_WEBHOOK_URL;

    const eventId = await outbox.enqueueEvent({
      tenantId,
      type: OUTBOX_EVENT.SLOTS_CHANGED,
      aggregateType: "Clinic",
      aggregateId: "clinic-noop-test",
      payload: { clinicId: "clinic-noop-test" },
    });

    const dispatcher = new OutboxDispatcherService(prismaSvc, new OutboxDeliveryService(prismaSvc));
    await dispatcher.processBatch(5);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    assert.equal(row.status, OUTBOX_STATUS.SENT);
    assert.ok(row.sentAt);

    if (prevUrl) process.env.KIOREX_OUTBOX_WEBHOOK_URL = prevUrl;
    await prisma.outboxEvent.delete({ where: { id: eventId } }).catch(() => undefined);
  });
});