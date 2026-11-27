import { opsContactAddress } from "../config/host-config";
import { DevInboxRecorder } from "../messaging/dev-inbox.recorder";
import { isMock } from "../common/provider-mode";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertPushSubscriptionDto } from "./dto/upsert-push-subscription.dto";

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsert(tenantId: string, userId: string, dto: UpsertPushSubscriptionDto) {
    const p256dh = String(dto.keys?.p256dh ?? "").trim();
    const auth = String(dto.keys?.auth ?? "").trim();
    if (!p256dh || !auth) {
      throw new BadRequestException("keys.p256dh and keys.auth are required");
    }
    const row = await this.prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint: dto.endpoint.trim() } },
      create: {
        tenantId,
        userId,
        endpoint: dto.endpoint.trim(),
        p256dh,
        auth,
        userAgent: dto.userAgent?.trim() || null,
      },
      update: {
        p256dh,
        auth,
        userAgent: dto.userAgent?.trim() || null,
      },
    });
    await this.audit.recordEvent({
      tenantId,
      actorId: userId,
      clinicId: null,
      action: "push.subscription_upserted",
      resource: "PushSubscription",
      resourceId: row.id,
      metadata: { endpointHost: safeHost(row.endpoint) },
    });
    return { id: row.id, endpoint: row.endpoint, createdAt: row.createdAt.toISOString() };
  }

  async remove(tenantId: string, userId: string, endpoint: string) {
    const existing = await this.prisma.pushSubscription.findFirst({
      where: { tenantId, userId, endpoint: endpoint.trim() },
    });
    if (!existing) return { removed: false };
    await this.prisma.pushSubscription.delete({ where: { id: existing.id } });
    await this.audit.recordEvent({
      tenantId,
      actorId: userId,
      clinicId: null,
      action: "push.subscription_removed",
      resource: "PushSubscription",
      resourceId: existing.id,
      metadata: { endpointHost: safeHost(existing.endpoint) },
    });
    return { removed: true };
  }

  async listForUser(tenantId: string, userId: string) {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Notify clinicians with push subscriptions about a new Kiorex booking.
   * Delivery requires VAPID keys (`WEB_PUSH_VAPID_PUBLIC` / `WEB_PUSH_VAPID_PRIVATE`);
   * without them we audit a skip so CI stays secret-free.
   */
  async notifyKiorexBooking(params: {
    tenantId: string;
    clinicianUserId: string;
    appointmentId: string;
    externalRef: string;
    startsAt: Date;
    clinicId?: string | null;
  }): Promise<{ queued: number; skippedReason?: string }> {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { tenantId: params.tenantId, userId: params.clinicianUserId },
    });
    if (subs.length === 0) return { queued: 0, skippedReason: "no_subscriptions" };

    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC?.trim();
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE?.trim();
    if (isMock("push") || !publicKey || !privateKey) {
      if (isMock("push")) {
        // Mock mode (default): the notification a clinician would get is rendered into the dev inbox.
        await DevInboxRecorder.record({
          channel: "PUSH",
          tenantId: params.tenantId,
          toAddress: params.clinicianUserId,
          templateKey: "kiorex_booking",
          subject: "New Kiorex booking",
          bodyText: `New Kiorex booking (${params.externalRef}) starts ${params.startsAt.toISOString()}`,
          relatedId: params.appointmentId,
        });
      }
      this.log.debug("WEB_PUSH_VAPID_* unset — recording intent only");
      await this.audit.recordEvent({
        tenantId: params.tenantId,
        actorId: null,
        clinicId: params.clinicId ?? null,
        action: "push.kiorex_booking_skipped_no_vapid",
        resource: "Appointment",
        resourceId: params.appointmentId,
        metadata: { subscriptionCount: subs.length, externalRef: params.externalRef },
      });
      return { queued: 0, skippedReason: "vapid_unset" };
    }

    let webpush: { setVapidDetails: Function; sendNotification: Function } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      webpush = require("web-push");
    } catch {
      return { queued: 0, skippedReason: "web_push_module_missing" };
    }
    webpush!.setVapidDetails(
      process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || `mailto:${opsContactAddress()}`,
      publicKey,
      privateKey,
    );

    const payload = JSON.stringify({
      title: "New Kiorex booking",
      titleAr: "حجز جديد من كيوركس",
      body: `Starts ${params.startsAt.toISOString()}`,
      appointmentId: params.appointmentId,
      externalRef: params.externalRef,
      url: `/appointments/${params.appointmentId}`,
    });

    let queued = 0;
    for (const sub of subs) {
      try {
        await webpush!.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        queued++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
        }
        this.log.warn(`push send failed for ${safeHost(sub.endpoint)}: ${String(err)}`);
      }
    }
    await this.audit.recordEvent({
      tenantId: params.tenantId,
      actorId: null,
      clinicId: params.clinicId ?? null,
      action: "push.kiorex_booking_sent",
      resource: "Appointment",
      resourceId: params.appointmentId,
      metadata: { queued, externalRef: params.externalRef },
    });
    return { queued };
  }
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}
