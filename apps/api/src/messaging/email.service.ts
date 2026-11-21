import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DevInboxRecorder } from "./dev-inbox.recorder";
import { loadEmailDomainAuth } from "./email-domain-auth";
import { createEmailProvider, type EmailProvider } from "./email.provider";
import {
  renderEmailTemplate,
  type EmailLocale,
  type EmailTemplateKey,
} from "./email-templates";

export type SendTransactionalEmailInput = {
  tenantId?: string | null;
  to: string;
  templateKey: EmailTemplateKey;
  /** Preferred locale; when "both", sends one message with EN subject and bilingual body via EN render + AR text appendix. */
  locale?: EmailLocale | "both";
  variables: Record<string, string | number | null | undefined>;
  tags?: Record<string, string>;
};

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private provider: EmailProvider = createEmailProvider();

  constructor(private readonly prisma: PrismaService) {}

  /** Test seam — Nest must not DI the provider (interface → Object metadata). */
  useProvider(provider: EmailProvider) {
    this.provider = provider;
  }

  /** Send a bilingual transactional email and persist EmailMessage for bounce tracking. */
  async send(input: SendTransactionalEmailInput) {
    const to = input.to.trim().toLowerCase();
    if (!to.includes("@")) {
      return { ok: false as const, error: "INVALID_EMAIL" };
    }
    const locale: EmailLocale = input.locale === "ar" ? "ar" : "en";
    let rendered = renderEmailTemplate(input.templateKey, locale, input.variables);
    if (input.locale === "both" || input.locale == null) {
      const ar = renderEmailTemplate(input.templateKey, "ar", input.variables);
      rendered = {
        ...rendered,
        text: `${rendered.text}\n\n---\n\n${ar.text}`,
        html: `${rendered.html}<hr/>${ar.html}`,
      };
    }

    const row = await this.prisma.emailMessage.create({
      data: {
        tenantId: input.tenantId ?? null,
        toEmail: to,
        templateKey: input.templateKey,
        subject: rendered.subject,
        status: "QUEUED",
        metadata: {
          locale: input.locale ?? "both",
          variables: input.variables,
        } as Prisma.InputJsonValue,
      },
    });

    const result = await this.provider.send({
      to,
      rendered,
      tags: { template: input.templateKey, ...(input.tags ?? {}) },
      reference: row.id,
    });

    if (!result.ok) {
      await this.prisma.emailMessage.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          error: result.error.slice(0, 500),
          failureClass: result.failureClass,
        },
      });
      this.log.warn(`email ${input.templateKey} → ${to} failed: ${result.error}`);
      return { ok: false as const, error: result.error, emailMessageId: row.id, retryable: result.retryable };
    }

    await this.prisma.emailMessage.update({
      where: { id: row.id },
      data: {
        status: "SENT",
        providerMessageId: result.providerMessageId,
        provider: result.provider,
        sentAt: new Date(),
      },
    });
    if (result.provider === "dev") {
      await DevInboxRecorder.record({
        channel: "EMAIL",
        tenantId: input.tenantId ?? null,
        toAddress: to,
        fromAddress: loadEmailDomainAuth().fromAddress,
        templateKey: input.templateKey,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        variables: input.variables,
        providerMessageId: result.providerMessageId,
        relatedId: row.id,
      });
    }
    return { ok: true as const, emailMessageId: row.id, providerMessageId: result.providerMessageId };
  }

  /** Mark bounce from SES SNS notification (by provider message id or recipient). */
  async recordBounce(input: {
    providerMessageId?: string | null;
    toEmail?: string | null;
    bounceType?: string | null;
    diagnostic?: string | null;
  }) {
    const where = input.providerMessageId
      ? { providerMessageId: input.providerMessageId }
      : input.toEmail
        ? { toEmail: input.toEmail.trim().toLowerCase(), status: "SENT" as const }
        : null;
    if (!where) return { updated: 0 };

    const rows = await this.prisma.emailMessage.findMany({
      where: "providerMessageId" in where ? where : { ...where },
      orderBy: { createdAt: "desc" },
      take: input.providerMessageId ? 1 : 5,
    });
    let updated = 0;
    for (const row of rows) {
      await this.prisma.emailMessage.update({
        where: { id: row.id },
        data: {
          status: "BOUNCED",
          bounceType: input.bounceType?.slice(0, 64) ?? "Permanent",
          error: input.diagnostic?.slice(0, 500) ?? null,
          bouncedAt: new Date(),
        },
      });
      updated += 1;
    }
    return { updated };
  }

  domainAuth() {
    return loadEmailDomainAuth();
  }
}
