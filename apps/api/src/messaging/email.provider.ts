import { assertEmailDomainAuthReady, loadEmailDomainAuth, type EmailDomainAuth } from "./email-domain-auth";
import { getEmailAdapter } from "../platform/adapters";
import { isMock } from "../common/provider-mode";
import type { RenderedEmail } from "./email-templates";
import { emailTransport } from "../common/provider-env";
import { HttpEmailTransport } from "./providers/email-http.provider";

export type EmailSendInput = {
  to: string;
  rendered: RenderedEmail;
  /** Optional SES configuration set / tags */
  tags?: Record<string, string>;
  /** Stable id (EmailMessage.id) used as the idempotency key for real providers. */
  reference?: string;
};

export type EmailSendResult =
  | { ok: true; providerMessageId: string; provider: "ses" | "http" | "dev" }
  | { ok: false; error: string; failureClass: "AUTH" | "DOMAIN" | "TRANSIENT" | "UNKNOWN"; retryable: boolean };

export type EmailProvider = {
  send(input: EmailSendInput, auth?: EmailDomainAuth): Promise<EmailSendResult>;
};

/** Mock mode (default) and local / test: never calls AWS. EmailService mirrors the rendered message into the dev inbox. */
export class DevEmailProvider implements EmailProvider {
  async send(input: EmailSendInput, auth = loadEmailDomainAuth()): Promise<EmailSendResult> {
    if (process.env.NODE_ENV === "production" && !isMock("email")) {
      try {
        assertEmailDomainAuthReady(auth);
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          failureClass: "DOMAIN",
          retryable: false,
        };
      }
    }
    const id = `dev-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (process.env.EMAIL_DEV_LOG === "1") {
      // eslint-disable-next-line no-console
      console.info(`[email:dev] to=${input.to} subject=${input.rendered.subject} id=${id}`);
    }
    return { ok: true, providerMessageId: id, provider: "dev" };
  }
}

/**
 * AWS SES (eu-central-1). Delivered through the platform email adapter; requires verified domain auth in production.
 * Falls back to DevEmailProvider (mock) unless the email provider mode is `real` (KIORLY_PROVIDER_MODE[_EMAIL]=real).
 */
export class SesEmailProvider implements EmailProvider {
  constructor(private readonly fallback: EmailProvider = new DevEmailProvider()) {}

  async send(input: EmailSendInput, auth = loadEmailDomainAuth()): Promise<EmailSendResult> {
    if (isMock("email")) {
      return this.fallback.send(input, auth);
    }
    try {
      assertEmailDomainAuthReady(auth);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        failureClass: "DOMAIN",
        retryable: false,
      };
    }
    try {
      const { messageId: id } = await getEmailAdapter().send({
        fromAddress: auth.fromAddress,
        region: auth.region,
        to: input.to,
        subject: input.rendered.subject,
        text: input.rendered.text,
        html: input.rendered.html,
        tags: input.tags,
      });
      return { ok: true, providerMessageId: id, provider: "ses" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /throttl|timeout|temporar|503|429/i.test(msg);
      return { ok: false, error: msg.slice(0, 500), failureClass: retryable ? "TRANSIENT" : "UNKNOWN", retryable };
    }
  }
}

/** Generic HTTP transactional email (EMAIL_TRANSPORT=http, real mode only; mock still falls back to the dev provider). */
export class HttpEmailProvider implements EmailProvider {
  constructor(
    private readonly transport: HttpEmailTransport = new HttpEmailTransport(),
    private readonly fallback: EmailProvider = new DevEmailProvider(),
  ) {}

  async send(input: EmailSendInput, auth = loadEmailDomainAuth()): Promise<EmailSendResult> {
    if (isMock("email")) return this.fallback.send(input, auth);
    const r = await this.transport.send({
      to: input.to,
      subject: input.rendered.subject,
      text: input.rendered.text,
      html: input.rendered.html,
      tags: input.tags,
      reference: input.reference ?? `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    return r.ok ? { ok: true, providerMessageId: r.providerMessageId, provider: "http" } : r;
  }
}

export function createEmailProvider(): EmailProvider {
  return emailTransport() === "http" ? new HttpEmailProvider() : new SesEmailProvider(new DevEmailProvider());
}
