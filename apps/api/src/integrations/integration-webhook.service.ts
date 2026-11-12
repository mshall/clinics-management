import { createHmac, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { IntegrationWebhookEvent } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateIntegrationWebhookDto } from "./dto/create-integration-webhook.dto";
import { IntegrationFailureCategory } from "@prisma/client";
import { generateWebhookSigningSecret } from "./integration-token";
import { IntegrationFailureLogService } from "./integration-failure-log.service";
import { buildFailureReasonDetail, summarizeFailureReason } from "./integration-failure-labels";

export type IntegrationWebhookPayload = {
  event: IntegrationWebhookEvent;
  tenantId: string;
  integrationClientId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

@Injectable()
export class IntegrationWebhookService {
  private readonly log = new Logger(IntegrationWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly failureLogs: IntegrationFailureLogService,
  ) {}

  listWebhooks(tenantId: string, integrationClientId: string) {
    return this.prisma.integrationWebhook.findMany({
      where: { tenantId, integrationClientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        deactivatedAt: true,
        lastDeliveredAt: true,
        lastFailureAt: true,
        lastFailureMessage: true,
        createdAt: true,
      },
    });
  }

  async createWebhook(tenantId: string, integrationClientId: string, body: CreateIntegrationWebhookDto) {
    const client = await this.prisma.integrationClient.findFirst({
      where: { id: integrationClientId, tenantId, deactivatedAt: null },
    });
    if (!client) throw new NotFoundException("Integration client not found");

    const eventTypes = [...new Set(body.eventTypes)];
    if (!eventTypes.length) throw new BadRequestException("At least one event type is required");

    const signingSecret = generateWebhookSigningSecret();
    const row = await this.prisma.integrationWebhook.create({
      data: {
        tenantId,
        integrationClientId,
        url: body.url.trim(),
        signingSecret,
        eventTypes,
      },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        createdAt: true,
      },
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      signingSecret,
    };
  }

  async deactivateWebhook(tenantId: string, integrationClientId: string, webhookId: string) {
    const existing = await this.prisma.integrationWebhook.findFirst({
      where: { id: webhookId, tenantId, integrationClientId, deactivatedAt: null },
    });
    if (!existing) throw new NotFoundException("Webhook not found");
    await this.prisma.integrationWebhook.update({
      where: { id: webhookId },
      data: { deactivatedAt: new Date() },
    });
    return { ok: true };
  }

  emit(integrationClientId: string, event: IntegrationWebhookEvent, data: Record<string, unknown>): void {
    void this.deliver(integrationClientId, event, data).catch((err) => {
      this.log.warn(`Webhook delivery setup failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async deliver(
    integrationClientId: string,
    event: IntegrationWebhookEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const hooks = await this.prisma.integrationWebhook.findMany({
      where: {
        integrationClientId,
        deactivatedAt: null,
        eventTypes: { has: event },
      },
    });
    if (!hooks.length) return;

    const client = await this.prisma.integrationClient.findUnique({
      where: { id: integrationClientId },
      select: { tenantId: true },
    });
    if (!client) return;

    const payload: IntegrationWebhookPayload = {
      event,
      tenantId: client.tenantId,
      integrationClientId,
      occurredAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    for (const hook of hooks) {
      void this.postHook(hook.id, hook.url, hook.signingSecret, event, body);
    }
  }

  private async postHook(
    webhookId: string,
    url: string,
    signingSecret: string,
    event: IntegrationWebhookEvent,
    body: string,
  ): Promise<void> {
    const deliveryId = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", signingSecret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Kiorly-Integrations-Webhook/1.0",
          "X-Kiorly-Event": event,
          "X-Kiorly-Delivery-Id": deliveryId,
          "X-Kiorly-Timestamp": String(timestamp),
          "X-Kiorly-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        await this.prisma.integrationWebhook.update({
          where: { id: webhookId },
          data: { lastDeliveredAt: new Date(), lastFailureAt: null, lastFailureMessage: null },
        });
        return;
      }

      const snippet = (await res.text()).slice(0, 240);
      const failureMessage = `HTTP ${res.status}: ${snippet}`;
      await this.prisma.integrationWebhook.update({
        where: { id: webhookId },
        data: {
          lastFailureAt: new Date(),
          lastFailureMessage: failureMessage,
        },
      });
      await this.recordWebhookFailure(webhookId, event, url, res.status, failureMessage, deliveryId);
    } catch (err) {
      const failureMessage = err instanceof Error ? err.message : String(err);
      await this.prisma.integrationWebhook.update({
        where: { id: webhookId },
        data: {
          lastFailureAt: new Date(),
          lastFailureMessage: failureMessage,
        },
      });
      await this.recordWebhookFailure(webhookId, event, url, 0, failureMessage, deliveryId);
    }
  }

  private async recordWebhookFailure(
    webhookId: string,
    event: IntegrationWebhookEvent,
    url: string,
    httpStatus: number,
    failureMessage: string,
    deliveryId: string,
  ): Promise<void> {
    const hook = await this.prisma.integrationWebhook.findUnique({
      where: { id: webhookId },
      include: { integrationClient: { select: { id: true, name: true, tenantId: true } } },
    });
    if (!hook?.integrationClient) return;

    const reason = summarizeFailureReason(httpStatus || 502, "WebhookDeliveryError", failureMessage);
    const reasonDetail = buildFailureReasonDetail(
      httpStatus || 502,
      "WebhookDeliveryError",
      failureMessage,
      "POST",
      url,
      { event, deliveryId, httpStatus: httpStatus || null },
    );

    await this.failureLogs.record({
      tenantId: hook.integrationClient.tenantId,
      integrationClientId: hook.integrationClientId,
      integrationClientName: hook.integrationClient.name,
      clinicId: null,
      category: IntegrationFailureCategory.WEBHOOK,
      operation: "DELIVER_WEBHOOK",
      operationName: "Deliver webhook",
      operationTypeLabel: "Outbound webhook",
      reason,
      reasonDetail,
      httpMethod: "POST",
      httpPath: url,
      statusCode: httpStatus || 502,
      errorCode: "WebhookDeliveryError",
      errorMessage: failureMessage,
      correlationId: deliveryId,
      trace: {
        steps: [
          { step: "webhook_selected", ok: true, detail: webhookId },
          { step: "post_target", ok: false, detail: failureMessage },
        ],
        exception: "WebhookDeliveryError",
      },
      requestContext: { event, url, webhookId },
    });
  }
}
