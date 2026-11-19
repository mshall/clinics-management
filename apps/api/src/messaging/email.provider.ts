import { assertEmailDomainAuthReady, loadEmailDomainAuth, type EmailDomainAuth } from "./email-domain-auth";
import type { RenderedEmail } from "./email-templates";

export type EmailSendInput = {
  to: string;
  rendered: RenderedEmail;
  /** Optional SES configuration set / tags */
  tags?: Record<string, string>;
};

export type EmailSendResult =
  | { ok: true; providerMessageId: string; provider: "ses" | "dev" }
  | { ok: false; error: string; failureClass: "AUTH" | "DOMAIN" | "TRANSIENT" | "UNKNOWN"; retryable: boolean };

export type EmailProvider = {
  send(input: EmailSendInput, auth?: EmailDomainAuth): Promise<EmailSendResult>;
};

/** Local / test: never calls AWS; still enforces domain auth when NODE_ENV=production. */
export class DevEmailProvider implements EmailProvider {
  async send(input: EmailSendInput, auth = loadEmailDomainAuth()): Promise<EmailSendResult> {
    if (process.env.NODE_ENV === "production") {
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
 * AWS SES (eu-central-1). Requires @aws-sdk/client-ses and verified domain auth in production.
 * Falls back to DevEmailProvider when SES is not configured (EMAIL_SES_ENABLED≠1).
 */
export class SesEmailProvider implements EmailProvider {
  constructor(private readonly fallback: EmailProvider = new DevEmailProvider()) {}

  async send(input: EmailSendInput, auth = loadEmailDomainAuth()): Promise<EmailSendResult> {
    if (process.env.EMAIL_SES_ENABLED !== "1") {
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
      // Dynamic import keeps unit tests free of AWS credentials.
      const ses = await import("@aws-sdk/client-ses");
      const client = new ses.SESClient({ region: auth.region });
      const res = await client.send(
        new ses.SendEmailCommand({
          Source: auth.fromAddress,
          Destination: { ToAddresses: [input.to] },
          Message: {
            Subject: { Data: input.rendered.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: input.rendered.text, Charset: "UTF-8" },
              Html: { Data: input.rendered.html, Charset: "UTF-8" },
            },
          },
          Tags: input.tags
            ? Object.entries(input.tags).map(([Name, Value]) => ({ Name, Value: String(Value).slice(0, 256) }))
            : undefined,
        }),
      );
      const id = res.MessageId ?? `ses-${Date.now()}`;
      return { ok: true, providerMessageId: id, provider: "ses" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = /throttl|timeout|temporar|503|429/i.test(msg);
      return { ok: false, error: msg.slice(0, 500), failureClass: retryable ? "TRANSIENT" : "UNKNOWN", retryable };
    }
  }
}

export function createEmailProvider(): EmailProvider {
  return new SesEmailProvider(new DevEmailProvider());
}
