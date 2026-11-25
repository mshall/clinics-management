import { secretsEqual } from "../common/http-hardening";
import { Body, Controller, Headers, Post, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { ApiExcludeController } from "@nestjs/swagger";
import { EmailService } from "./email.service";

/**
 * SES bounce / complaint SNS endpoint (MS-05).
 * Subscribe the SNS topic (bounce + complaint) to POST /api/v1/webhooks/email/ses.
 * Protect with EMAIL_SES_WEBHOOK_SECRET header `x-kiorly-email-webhook-secret`.
 */
@ApiExcludeController()
@Controller("webhooks/email")
export class EmailBounceController {
  constructor(private readonly email: EmailService) {}

  @Post("ses")
  async ses(
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-kiorly-email-webhook-secret") secret?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const expected = process.env.EMAIL_SES_WEBHOOK_SECRET?.trim();
    // fail CLOSED (pentest 2026-11): without a configured secret anyone could suppress a patient's e-mail by posting a fake bounce. Dev/test keep the open mock path.
    // Amazon SNS cannot send a custom header: it sends HTTP basic auth taken from the subscription URL (https://sns:<secret>@host/...), so the password is accepted too.
    if (expected ? !(secretsEqual(secret, expected) || secretsEqual(basicPassword(authorization), expected)) : process.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    // SNS posts Content-Type text/plain: the body arrives as a string (or is only available raw)
    const raw = parseSnsBody(body, req?.rawBody);
    if (raw.Type === "SubscriptionConfirmation") {
      const url = snsConfirmUrl(raw);
      if (url && process.env.NODE_ENV !== "test") await fetch(url, { method: "GET" }).catch(() => undefined); // only https://sns.<region>.amazonaws.com
      return { ok: true, confirm: !!url };
    }

    let notification = raw;
    if (typeof raw.Message === "string") {
      try {
        notification = JSON.parse(raw.Message) as Record<string, unknown>;
      } catch {
        notification = raw;
      }
    }

    const mail = asRecord(notification.mail);
    const bounce = asRecord(notification.bounce);
    const complaint = asRecord(notification.complaint);
    const providerMessageId = typeof mail.messageId === "string" ? mail.messageId : null;
    const recipients =
      (Array.isArray(bounce.bouncedRecipients) ? bounce.bouncedRecipients : null) ??
      (Array.isArray(complaint.complainedRecipients) ? complaint.complainedRecipients : null) ??
      [];
    const toEmail =
      recipients.length && typeof asRecord(recipients[0]).emailAddress === "string"
        ? String(asRecord(recipients[0]).emailAddress)
        : null;
    const bounceType =
      typeof bounce.bounceType === "string"
        ? bounce.bounceType
        : complaint.complaintFeedbackType
          ? `complaint:${String(complaint.complaintFeedbackType)}`
          : notification.notificationType
            ? String(notification.notificationType)
            : "Unknown";

    // Only a PERMANENT bounce or a complaint marks the message BOUNCED; Send, Delivery, Reject and a TRANSIENT bounce (mailbox full) must not (the configuration set publishes them too)
    const eventType = String(notification.eventType ?? notification.notificationType ?? "");
    const permanent = eventType === "Bounce" && String(bounce.bounceType ?? "").toLowerCase() === "permanent";
    if (!permanent && eventType !== "Complaint") return { ok: true, ignored: eventType || "unknown" };
    const result = await this.email.recordBounce({
      providerMessageId,
      toEmail,
      bounceType,
      diagnostic: typeof bounce.reportingMTA === "string" ? bounce.reportingMTA : null,
    });
    return { ok: true, ...result };
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/** SNS subscription confirmation URL, only on an https sns.<region>.amazonaws.com host. */
export function snsConfirmUrl(raw: Record<string, unknown>): string | null {
  try { const u = new URL(String(raw.SubscribeURL)); return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.host) ? u.toString() : null; } catch { return null; }
}
export function basicPassword(header: string | undefined): string | undefined {
  if (!header?.startsWith("Basic ")) return undefined;
  const d = Buffer.from(header.slice(6), "base64").toString("utf8"); const i = d.indexOf(":");
  return i >= 0 ? d.slice(i + 1) : undefined;
}
export function parseSnsBody(body: unknown, rawBody?: Buffer): Record<string, unknown> {
  if (typeof body === "string") { try { return asRecord(JSON.parse(body)); } catch { return {}; } }
  const o = asRecord(body);
  if (Object.keys(o).length) return o;
  if (rawBody?.length) { try { return asRecord(JSON.parse(rawBody.toString("utf8"))); } catch { return {}; } }
  return o;
}
