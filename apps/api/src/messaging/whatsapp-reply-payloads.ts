/** Meta quick-reply button payloads (MS-02). */
export const WHATSAPP_REPLY_CONFIRM = "KIORLY_CONFIRM";
export const WHATSAPP_REPLY_CANCEL = "KIORLY_CANCEL";
export const WHATSAPP_REPLY_RESCHEDULE = "KIORLY_RESCHEDULE";
/** FS-03 waitlist slot offer buttons. */
export const WHATSAPP_REPLY_WAITLIST_ACCEPT = "KIORLY_WAITLIST_ACCEPT";
export const WHATSAPP_REPLY_WAITLIST_DECLINE = "KIORLY_WAITLIST_DECLINE";
export const WAITLIST_OFFER_QUICK_REPLIES = [WHATSAPP_REPLY_WAITLIST_ACCEPT, WHATSAPP_REPLY_WAITLIST_DECLINE] as const;

export const WAITLIST_OFFER_TEMPLATE_KEY = "waitlist_slot_offer";
export const WAITLIST_BOOKED_TEMPLATE_KEY = "waitlist_slot_booked";
export const WAITLIST_CLOSED_TEMPLATE_KEY = "waitlist_offer_closed";

export const DEFAULT_REMINDER_QUICK_REPLIES = [
  WHATSAPP_REPLY_CONFIRM,
  WHATSAPP_REPLY_CANCEL,
  WHATSAPP_REPLY_RESCHEDULE,
] as const;

export type WhatsAppReplyAction = "confirm" | "cancel" | "reschedule" | "waitlist_accept" | "waitlist_decline";

export function replyActionFromPayload(payload: string | undefined | null): WhatsAppReplyAction | null {
  const p = payload?.trim().toUpperCase();
  if (p === WHATSAPP_REPLY_CONFIRM) return "confirm";
  if (p === WHATSAPP_REPLY_CANCEL) return "cancel";
  if (p === WHATSAPP_REPLY_RESCHEDULE) return "reschedule";
  if (p === WHATSAPP_REPLY_WAITLIST_ACCEPT) return "waitlist_accept";
  if (p === WHATSAPP_REPLY_WAITLIST_DECLINE) return "waitlist_decline";
  return null;
}

export const OUTBOX_TOPIC_FRONT_DESK_WHATSAPP = "front_desk.appointment_whatsapp_reply";