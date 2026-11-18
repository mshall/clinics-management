import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageChannel } from "@prisma/client";
import type { MessagingConsentService } from "../patients/messaging-consent.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { UsageMeterService } from "../usage/usage-meter.service";
import { OutboundMessageWorker } from "./outbound-message.worker";
import type { WhatsAppSendService } from "./whatsapp-send.service";

test("ON-08: queued WhatsApp/SMS for a sample patient is failed, never sent", async () => {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const rows = [
    { id: "m1", tenantId: "t", patientId: "sample", channel: MessageChannel.WHATSAPP, templateKey: "appointment_confirm", attemptCount: 0 },
    { id: "m2", tenantId: "t", patientId: "sample", channel: MessageChannel.SMS, templateKey: null, attemptCount: 0 },
  ];
  const prisma = {
    outboundMessage: {
      findMany: async () => rows,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: args.where.id, data: args.data });
        return {};
      },
    },
  } as unknown as PrismaService;
  const whatsapp = {
    sendTemplateForTenant: async () => {
      throw new Error("must not send");
    },
  } as unknown as WhatsAppSendService;
  const consent = { isSamplePatient: async () => true } as unknown as MessagingConsentService;
  const worker = new OutboundMessageWorker(prisma, whatsapp, consent, {} as UsageMeterService);
  await worker.processBatch();
  assert.deepEqual(
    updates.map((u) => [u.id, u.data.status, u.data.failureClass]),
    [
      ["m1", "FAILED", "POLICY"],
      ["m2", "FAILED", "POLICY"],
    ],
  );
});
