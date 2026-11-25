/**
 * Meta WhatsApp Cloud API helpers for the Clinic (MSG-REAL, 25 Nov 2026). Pure, no I/O. Mirrors the Kiorex platform copy (`kiorex-platform/apps/api/src/common/providers/vendors/meta-whatsapp.ts`):
 * products never import each other's source, so the small shared surface is vendored. VERIFY the error table against Meta's current list at go-live.
 */
export type MetaErrorAction = "THROTTLE" | "NEED_TEMPLATE" | "TEMPLATE" | "INVALID_RECIPIENT" | "AUTH" | "RETRY" | "PAYLOAD" | "UNKNOWN";
const TABLE: Record<number, MetaErrorAction> = {
  0: "AUTH", 190: "AUTH", 10: "AUTH", 200: "AUTH", 368: "AUTH", 131031: "AUTH", 131005: "AUTH", 133010: "AUTH",
  4: "THROTTLE", 17: "THROTTLE", 32: "THROTTLE", 613: "THROTTLE", 80007: "THROTTLE", 130429: "THROTTLE", 131048: "THROTTLE", 131056: "THROTTLE",
  131047: "NEED_TEMPLATE",
  132000: "TEMPLATE", 132001: "TEMPLATE", 132005: "TEMPLATE", 132007: "TEMPLATE", 132012: "TEMPLATE", 132015: "TEMPLATE", 132016: "TEMPLATE", 132068: "TEMPLATE", 132069: "TEMPLATE",
  131026: "INVALID_RECIPIENT", 131030: "INVALID_RECIPIENT", 131021: "INVALID_RECIPIENT", 1: "RETRY", 2: "RETRY", 131000: "RETRY", 131016: "RETRY", 131057: "RETRY",
  100: "PAYLOAD", 131008: "PAYLOAD", 131009: "PAYLOAD", 131051: "PAYLOAD", 131052: "PAYLOAD", 131053: "PAYLOAD", 135000: "PAYLOAD",
};
export const classifyMetaCode = (code: number | string | undefined | null): MetaErrorAction => (code === undefined || code === null || code === "" ? "UNKNOWN" : TABLE[Number(code)] ?? "UNKNOWN");

/** Numeric code from a Graph error body (`error.code`) or a status webhook error entry (`code`). Never the message text. */
export function metaCodeFromBody(text: string): number | undefined {
  try { const j = JSON.parse(text); const c = Number(j?.error?.code ?? j?.errors?.[0]?.code ?? j?.code); return Number.isFinite(c) ? c : undefined; } catch { return undefined; }
}
export type ClinicFailureClass = "TRANSIENT" | "TEMPLATE" | "POLICY" | "AUTH" | "UNKNOWN";
export function failureClassForAction(a: MetaErrorAction): { failureClass: ClinicFailureClass; retryable: boolean } {
  switch (a) {
    case "THROTTLE": case "RETRY": return { failureClass: "TRANSIENT", retryable: true };
    case "NEED_TEMPLATE": return { failureClass: "POLICY", retryable: false };
    case "TEMPLATE": case "PAYLOAD": return { failureClass: "TEMPLATE", retryable: false };
    case "AUTH": return { failureClass: "AUTH", retryable: false };
    default: return { failureClass: "UNKNOWN", retryable: false };
  }
}

export type MetaAccountEvent =
  | { type: "TEMPLATE_STATUS"; templateId: string; name: string; language: string; event: string; reason?: string }
  | { type: "TEMPLATE_QUALITY"; templateId: string; name: string; language: string; quality: string }
  | { type: "PHONE_QUALITY"; event: string; tier?: string }
  | { type: "ACCOUNT"; event: string };
export function parseMetaAccountEvents(body: unknown): MetaAccountEvent[] {
  const out: MetaAccountEvent[] = [];
  const j = body as { object?: string; entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> } | null;
  if (j?.object !== "whatsapp_business_account") return out;
  const s = (x: unknown, n = 120) => String(x ?? "").slice(0, n);
  for (const e of j.entry ?? []) for (const ch of e.changes ?? []) {
    const v = ch.value; if (!v) continue;
    switch (ch.field) {
      case "message_template_status_update": if (v.message_template_id !== undefined) out.push({ type: "TEMPLATE_STATUS", templateId: s(v.message_template_id, 40), name: s(v.message_template_name, 512), language: s(v.message_template_language, 20), event: s(v.event, 40).toUpperCase(), ...(v.reason && v.reason !== "NONE" ? { reason: s(v.reason, 80) } : {}) }); break;
      case "message_template_quality_update": if (v.message_template_id !== undefined) out.push({ type: "TEMPLATE_QUALITY", templateId: s(v.message_template_id, 40), name: s(v.message_template_name, 512), language: s(v.message_template_language, 20), quality: s(v.new_quality_score, 20).toUpperCase() }); break;
      case "phone_number_quality_update": out.push({ type: "PHONE_QUALITY", event: s(v.event, 40).toUpperCase(), ...(v.current_limit ? { tier: s(v.current_limit, 30).toUpperCase() } : {}) }); break;
      case "account_update": case "account_alerts": case "account_review_update": out.push({ type: "ACCOUNT", event: s(v.event ?? v.alert_type ?? v.decision, 60).toUpperCase() }); break;
      default: break;
    }
  }
  return out;
}

/** 24 h customer-service window from the customer's last inbound message. */
export function windowOpen(lastInboundMs: number | null | undefined, nowMs: number, hours = 24): boolean {
  if (!lastInboundMs || !Number.isFinite(lastInboundMs) || lastInboundMs > nowMs + 60_000) return false;
  return nowMs < lastInboundMs + hours * 3_600_000;
}

export class MetaPayloadError extends Error { constructor(public readonly code: string) { super(code); } }
export const metaPhone = (p: string) => p.replace(/\D/g, "");
export const sanitizeTemplateParam = (v: string) => (String(v ?? "").replace(/[\r\n]+/g, " | ").replace(/\t/g, " ").replace(/ {5,}/g, "    ").trim() || "-").slice(0, 1024);

/** Reply buttons (max 3, id up to 256 characters, title up to 20): the id round-trips verbatim in `interactive.button_reply.id`; too long is an error, never a cut. */
export function interactiveButtonsBody(i: { to: string; body: string; buttons: Array<{ id: string; title: string }> }) {
  if (!i.buttons.length || i.buttons.length > 3) throw new MetaPayloadError("WA_BUTTON_COUNT");
  const ids = new Set<string>();
  for (const b of i.buttons) { if (!b.id || b.id.length > 256) throw new MetaPayloadError("WA_BUTTON_ID_TOO_LONG"); if (ids.has(b.id)) throw new MetaPayloadError("WA_BUTTON_ID_DUPLICATE"); ids.add(b.id); }
  if (!i.body.trim()) throw new MetaPayloadError("WA_BODY_EMPTY");
  return { messaging_product: "whatsapp", recipient_type: "individual", to: metaPhone(i.to), type: "interactive", interactive: { type: "button", body: { text: i.body.slice(0, 1024) }, action: { buttons: i.buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: Array.from(b.title).slice(0, 20).join("") } })) } } };
}
export const sessionTextBody = (i: { to: string; body: string }) => ({ messaging_product: "whatsapp", recipient_type: "individual", to: metaPhone(i.to), type: "text", text: { preview_url: false, body: i.body.slice(0, 4096) } });

/** Authentication (OTP) template send: the code is body parameter {{1}} and the one-tap / copy-code button parameter (Meta's AUTHENTICATION template shape). */
export function authenticationTemplateBody(i: { to: string; templateName: string; languageCode: string; code: string }) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: metaPhone(i.to), type: "template", template: { name: i.templateName, language: { code: i.languageCode }, components: [{ type: "body", parameters: [{ type: "text", text: i.code }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: i.code }] }] } };
}
