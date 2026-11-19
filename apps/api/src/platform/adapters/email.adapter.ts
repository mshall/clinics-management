/**
 * KX-21 §01 email adapter: `send(...)`. The only place that may import the SES SDK.
 */
export type EmailAdapterMessage = {
  fromAddress: string;
  region: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  tags?: Record<string, string>;
};

export interface EmailAdapter {
  /** Returns the provider message id; throws on provider error. */
  send(message: EmailAdapterMessage): Promise<{ messageId: string }>;
}

export class AwsSesEmailAdapter implements EmailAdapter {
  async send(m: EmailAdapterMessage): Promise<{ messageId: string }> {
    // Dynamic import keeps unit tests free of AWS credentials.
    const ses = await import("@aws-sdk/client-ses");
    const client = new ses.SESClient({ region: m.region });
    const res = await client.send(
      new ses.SendEmailCommand({
        Source: m.fromAddress,
        Destination: { ToAddresses: [m.to] },
        Message: {
          Subject: { Data: m.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: m.text, Charset: "UTF-8" },
            Html: { Data: m.html, Charset: "UTF-8" },
          },
        },
        Tags: m.tags
          ? Object.entries(m.tags).map(([Name, Value]) => ({ Name, Value: String(Value).slice(0, 256) }))
          : undefined,
      }),
    );
    return { messageId: res.MessageId ?? `ses-${Date.now()}` };
  }
}

let current: EmailAdapter = new AwsSesEmailAdapter();

export function getEmailAdapter(): EmailAdapter {
  return current;
}

/** Test seam. */
export function setEmailAdapter(adapter: EmailAdapter): void {
  current = adapter;
}
