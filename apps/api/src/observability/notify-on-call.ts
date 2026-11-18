import { Logger } from "@nestjs/common";
import { alertById, type OperationalAlertId } from "./operational-alerts";

const log = new Logger("OnCallAlert");

export type OnCallAlertPayload = Record<string, unknown>;

function formatSlackText(alertId: OperationalAlertId, payload: OnCallAlertPayload): string {
  const def = alertById(alertId);
  const env = process.env.KIORLY_ENV?.trim() || process.env.NODE_ENV || "dev";
  const detail = Object.keys(payload).length ? `\n${JSON.stringify(payload)}` : "";
  return `[Kiorly ${env}] ${def.severity.toUpperCase()} · ${def.id}\n${def.titleEn}\nRunbook: Docs/runbooks/${def.runbookDoc}${detail}`;
}

/**
 * Fire-and-forget on-call notification (Slack incoming webhook + optional generic WhatsApp bridge URL).
 * No-op when webhooks are unset (local dev).
 */
export function notifyOnCall(alertId: OperationalAlertId, payload: OnCallAlertPayload = {}): void {
  const def = alertById(alertId);
  const hint = typeof payload.message === "string" ? ` — ${payload.message}` : "";
  log.warn(`${def.id}: ${def.titleEn}${hint}`);

  const slack = process.env.PLATFORM_ONCALL_SLACK_WEBHOOK_URL?.trim();
  const whatsapp = process.env.PLATFORM_ONCALL_WHATSAPP_WEBHOOK_URL?.trim();
  const text = formatSlackText(alertId, payload);

  const post = (url: string, body: unknown) => {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch((e) => {
      log.warn(`On-call notify failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  if (slack) post(slack, { text });
  if (whatsapp) post(whatsapp, { alertId, severity: def.severity, text, payload });
}