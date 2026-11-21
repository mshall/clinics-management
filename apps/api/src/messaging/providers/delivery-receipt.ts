/**
 * Provider-neutral delivery receipt. Each kind's `*.mapping.ts` turns the vendor's webhook body into these;
 * `DeliveryReceiptService` is the only code that persists them (OutboundMessage / EmailMessage).
 */
export type DeliveryState = "sent" | "delivered" | "read" | "failed" | "bounced";

export type DeliveryReceipt = {
  providerMessageId: string;
  status: DeliveryState;
  at?: Date;
  error?: string;
};

const SYNONYMS: Record<string, DeliveryState> = {
  sent: "sent",
  accepted: "sent",
  submitted: "sent",
  queued: "sent",
  delivered: "delivered",
  delivery: "delivered",
  success: "delivered",
  read: "read",
  seen: "read",
  failed: "failed",
  failure: "failed",
  undelivered: "failed",
  rejected: "failed",
  expired: "failed",
  error: "failed",
  bounced: "bounced",
  bounce: "bounced",
  complained: "bounced",
  complaint: "bounced",
};

export function normalizeDeliveryState(raw: unknown): DeliveryState | null {
  const key = String(raw ?? "").trim().toLowerCase();
  return SYNONYMS[key] ?? null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseTime(v: unknown): Date | undefined {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n * 1000);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Neutral receipt body (documented in Docs/PROVIDER_INTEGRATION.md):
 *   { "events": [ { "id": "<provider message id>", "status": "delivered|read|failed|bounced|sent", "timestamp": 1735689600, "error": "..." } ] }
 * A single event object, or `{ "data": ... }`, is accepted too. Vendors that differ are adapted in the kind's mapping file.
 */
export function parseNeutralReceipts(payload: unknown): DeliveryReceipt[] {
  const root = asRecord(payload);
  const list = Array.isArray(root.events)
    ? root.events
    : Array.isArray(payload)
      ? (payload as unknown[])
      : root.data && typeof root.data === "object"
        ? Array.isArray(root.data)
          ? (root.data as unknown[])
          : [root.data]
        : [root];
  const out: DeliveryReceipt[] = [];
  for (const item of list) {
    const e = asRecord(item);
    const id = String(e.id ?? e.messageId ?? e.message_id ?? e.providerMessageId ?? "").trim();
    const status = normalizeDeliveryState(e.status ?? e.state ?? e.event);
    if (!id || !status) continue;
    const err = e.error ?? e.reason ?? e.error_message;
    out.push({
      providerMessageId: id,
      status,
      at: parseTime(e.timestamp ?? e.at ?? e.time),
      error: typeof err === "string" ? err.slice(0, 500) : err && typeof err === "object" ? String(asRecord(err).message ?? "").slice(0, 500) || undefined : undefined,
    });
  }
  return out;
}
