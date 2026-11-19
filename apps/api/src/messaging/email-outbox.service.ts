import { Injectable, Logger } from "@nestjs/common";
import { EmailService } from "./email.service";
import type { EmailTemplateKey } from "./email-templates";

/** Delivers INTERNAL outbox email-channel payloads for trial + invoice topics (MS-05). */
@Injectable()
export class EmailOutboxService {
  private readonly log = new Logger(EmailOutboxService.name);

  constructor(private readonly email: EmailService) {}

  async deliverTrialNotification(tenantId: string, payload: unknown): Promise<{ sent: boolean }> {
    const p = asRecord(payload);
    if (String(p.channel ?? "").toLowerCase() !== "email") return { sent: false };
    const to = String(p.to ?? "").trim();
    if (!to) {
      this.log.warn(`trial email skipped — no owner email for tenant ${tenantId}`);
      return { sent: false };
    }
    const res = await this.email.send({
      tenantId,
      to,
      templateKey: "trial_notification",
      locale: "both",
      variables: {
        kind: String(p.kind ?? "trial_ending"),
        daysRemaining: p.daysRemaining as string | number | undefined,
        planName: (p.planName as string) ?? "Kiorly",
      },
      tags: { topic: "billing.trial_notification" },
    });
    if (!res.ok) throw new Error(res.error);
    return { sent: true };
  }

  async deliverStatementReady(tenantId: string, payload: unknown): Promise<{ sent: boolean }> {
    const p = asRecord(payload);
    if (String(p.channel ?? "").toLowerCase() !== "email") return { sent: false };
    const to = String(p.to ?? "").trim();
    if (!to) {
      this.log.warn(`statement email skipped — no owner email for tenant ${tenantId}`);
      return { sent: false };
    }
    const res = await this.email.send({
      tenantId,
      to,
      templateKey: "kiorly_invoice_statement",
      locale: "both",
      variables: {
        invoiceNumber: p.invoiceNumber as string,
        periodKey: p.periodKey as string,
        total: p.total as string,
        currency: p.currency as string,
        statementPath: p.statementPath as string,
      },
      tags: { topic: "billing.monthly_statement_ready" },
    });
    if (!res.ok) throw new Error(res.error);
    return { sent: true };
  }

  /** Generic handler for topics that already carry templateKey in the payload. */
  async deliverGeneric(tenantId: string, payload: unknown, fallbackTemplate: EmailTemplateKey): Promise<{ sent: boolean }> {
    const p = asRecord(payload);
    if (String(p.channel ?? "email").toLowerCase() !== "email") return { sent: false };
    const to = String(p.to ?? "").trim();
    if (!to) return { sent: false };
    const templateKey = (String(p.templateKey ?? fallbackTemplate) as EmailTemplateKey) || fallbackTemplate;
    const res = await this.email.send({
      tenantId,
      to,
      templateKey,
      locale: "both",
      variables: (p.variables as Record<string, string | number | null | undefined>) ?? p,
      tags: { topic: String(p.topic ?? templateKey) },
    });
    if (!res.ok) throw new Error(res.error);
    return { sent: true };
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload as Record<string, unknown>;
  return {};
}
