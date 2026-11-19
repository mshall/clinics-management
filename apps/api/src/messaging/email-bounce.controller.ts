import { Body, Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
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
    @Headers("x-kiorly-email-webhook-secret") secret?: string,
  ) {
    const expected = process.env.EMAIL_SES_WEBHOOK_SECRET?.trim();
    if (expected && secret !== expected) {
      throw new UnauthorizedException("Invalid webhook secret");
    }

    // SNS subscription confirmation
    const raw = asRecord(body);
    if (raw.Type === "SubscriptionConfirmation" && typeof raw.SubscribeURL === "string") {
      return { ok: true, confirm: true, subscribeUrl: raw.SubscribeURL };
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
