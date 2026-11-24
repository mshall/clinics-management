import { createHash, createHmac, randomBytes } from "node:crypto";
import type { ConnectStatus } from "./kiorex-connect.logic";

/**
 * The state-aware Kiorex tab (ADR-040 front door). Pure helpers, unit tested without a database.
 * NOT_CONNECTED = standalone and nothing started; IN_PROGRESS = the wizard was started or terms accepted; WAITING = request sent, Kiorex reviewing;
 * LIVE = approved (or a legacy organisation that was always connected); ATTENTION = Kiorex paused it, asked for changes or did not approve.
 */
export type FrontDoorState = "NOT_CONNECTED" | "IN_PROGRESS" | "WAITING" | "LIVE" | "ATTENTION";

export function frontDoorState(input: { legacy: boolean; status: ConnectStatus; started: boolean }): FrontDoorState {
  if (input.legacy) return "LIVE";
  switch (input.status) {
    case "APPROVED": return "LIVE";
    case "REQUESTED": return "WAITING";
    case "PAUSED":
    case "CHANGES_REQUESTED":
    case "REJECTED": return "ATTENTION";
    case "CONSENTED": return "IN_PROGRESS";
    default: return input.started ? "IN_PROGRESS" : "NOT_CONNECTED";
  }
}

export const LEAD_TIMES = ["MORNING", "AFTERNOON", "EVENING", "ANYTIME"] as const;
export interface TalkToUsInput { contactName?: unknown; contactRole?: unknown; phone?: unknown; email?: unknown; preferredTime?: unknown; note?: unknown; consent?: unknown }
export interface TalkToUsClean { contactName: string; contactRole?: string; phone?: string; email?: string; preferredTime?: (typeof LEAD_TIMES)[number]; note?: string }
export class LeadInputError extends Error { constructor(public readonly code: string, public readonly field?: string) { super(code); } }

const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const clip = (v: unknown, max: number, field: string): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new LeadInputError("INVALID_FIELD", field);
  const s = v.trim(); if (!s) return undefined;
  if (s.length > max || CTRL.test(s)) throw new LeadInputError("INVALID_FIELD", field);
  return s;
};
/** Validates the Talk to us form. Consent to be contacted and one way to reach the person are required. */
export function cleanTalkToUs(i: TalkToUsInput): TalkToUsClean {
  if (i.consent !== true) throw new LeadInputError("CONSENT_REQUIRED", "consent");
  const contactName = clip(i.contactName, 120, "contactName"); if (!contactName) throw new LeadInputError("INVALID_FIELD", "contactName");
  const phone = clip(i.phone, 24, "phone"); if (phone && !/^\+?[0-9][0-9 ()-]{6,22}$/.test(phone)) throw new LeadInputError("INVALID_FIELD", "phone");
  const email = clip(i.email, 160, "email"); if (email && !/^[^\s@]{1,64}@[^\s@]{1,120}\.[^\s@]{2,}$/.test(email)) throw new LeadInputError("INVALID_FIELD", "email");
  if (!phone && !email) throw new LeadInputError("CONTACT_REQUIRED", "phone");
  const pt = clip(i.preferredTime, 12, "preferredTime");
  if (pt && !(LEAD_TIMES as readonly string[]).includes(pt)) throw new LeadInputError("INVALID_FIELD", "preferredTime");
  return { contactName, contactRole: clip(i.contactRole, 80, "contactRole"), phone, email, preferredTime: pt as TalkToUsClean["preferredTime"], note: clip(i.note, 500, "note") };
}

/** Lead and funnel requests are signed like the intake: sha256=HMAC(sha256hex(secret), "<ts>.<rawBody>"). Dev default only outside production. */
export function leadSigningSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.KIOREX_LEAD_SIGNING_SECRET?.trim() || (env.NODE_ENV === "production" ? "" : "kiorex-dev-lead-signing-secret");
  return s || null;
}
export function leadHeaders(secret: string, ts: number, body: string): Record<string, string> {
  const key = createHash("sha256").update(secret, "utf8").digest("hex");
  return { "content-type": "application/json", "X-Kiorly-Timestamp": String(ts), "X-Kiorly-Signature": `sha256=${createHmac("sha256", key).update(`${ts}.${body}`).digest("hex")}` };
}
export const newLeadNonce = (): string => randomBytes(18).toString("base64url");
