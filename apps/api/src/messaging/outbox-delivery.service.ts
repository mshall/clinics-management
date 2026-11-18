import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type SignedOutboxEnvelope = {
  eventId: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  target: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

@Injectable()
export class OutboxDeliveryService {
  private readonly log = new Logger(OutboxDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  buildEnvelope(row: {
    id: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    target: string;
    createdAt: Date;
    payload: unknown;
  }): SignedOutboxEnvelope {
    const data =
      row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
    return {
      eventId: row.id,
      type: row.type,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      target: row.target,
      occurredAt: row.createdAt.toISOString(),
      data,
    };
  }

  signBody(secret: string, timestamp: number, body: string): string {
    return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  }

  async deliver(row: {
    id: string;
    tenantId: string;
    type: string;
    aggregateType: string;
    aggregateId: string;
    target: string;
    createdAt: Date;
    payload: unknown;
  }): Promise<{ ok: true } | { ok: false; message: string; retryable: boolean }> {
    const envelope = this.buildEnvelope(row);
    const body = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000);

    if (row.target === "KIOREX") {
      const url = process.env.KIOREX_OUTBOX_WEBHOOK_URL?.trim();
      const secret = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET?.trim();
      if (!url || !secret) {
        this.log.debug(`KIOREX outbox skip (no URL): ${row.id} ${row.type}`);
        return { ok: true };
      }
      return this.post(url, secret, row.type, row.id, timestamp, body);
    }

    if (row.target.startsWith("TENANT_WEBHOOK:")) {
      const webhookId = row.target.slice("TENANT_WEBHOOK:".length);
      const hook = await this.prisma.integrationWebhook.findFirst({
        where: { id: webhookId, tenantId: row.tenantId, deactivatedAt: null },
      });
      if (!hook) return { ok: false, message: "Webhook not found", retryable: false };
      const result = await this.post(hook.url, hook.signingSecret, row.type, row.id, timestamp, body);
      if (result.ok) {
        await this.prisma.integrationWebhook.update({
          where: { id: hook.id },
          data: { lastDeliveredAt: new Date(), lastFailureAt: null, lastFailureMessage: null },
        });
      } else {
        await this.prisma.integrationWebhook.update({
          where: { id: hook.id },
          data: { lastFailureAt: new Date(), lastFailureMessage: result.message },
        });
      }
      return result;
    }

    return { ok: false, message: `Unknown target ${row.target}`, retryable: false };
  }

  private async post(
    url: string,
    secret: string,
    eventType: string,
    eventId: string,
    timestamp: number,
    body: string,
  ): Promise<{ ok: true } | { ok: false; message: string; retryable: boolean }> {
    const signature = this.signBody(secret, timestamp, body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Kiorly-Outbox/1.0",
          "X-Kiorly-Event": eventType,
          "X-Kiorly-Event-Id": eventId,
          "X-Kiorly-Timestamp": String(timestamp),
          "X-Kiorly-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true };
      const snippet = (await res.text()).slice(0, 240);
      const retryable = res.status >= 500 || res.status === 429;
      return { ok: false, message: `HTTP ${res.status}: ${snippet}`, retryable };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }

  static parseWebhookTarget(target: string): string | null {
    if (!target.startsWith("TENANT_WEBHOOK:")) return null;
    return target.slice("TENANT_WEBHOOK:".length) || null;
  }
}