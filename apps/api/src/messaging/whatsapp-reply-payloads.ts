/** Meta quick-reply button payloads (MS-02). */
export const WHATSAPP_REPLY_CONFIRM = "KIORLY_CONFIRM";
export const WHATSAPP_REPLY_CANCEL = "KIORLY_CANCEL";
export const WHATSAPP_REPLY_RESCHEDULE = "KIORLY_RESCHEDULE";

export const DEFAULT_REMINDER_QUICK_REPLIES = [
  WHATSAPP_REPLY_CONFIRM,
  WHATSAPP_REPLY_CANCEL,
  WHATSAPP_REPLY_RESCHEDULE,
] as const;

export type WhatsAppReplyAction = "confirm" | "cancel" | "reschedule";

export function replyActionFromPayload(payload: string | undefined | null): WhatsAppReplyAction | null {
  const p = payload?.trim().toUpperCase();
  if (p === WHATSAPP_REPLY_CONFIRM) return "confirm";
  if (p === WHATSAPP_REPLY_CANCEL) return "cancel";
  if (p === WHATSAPP_REPLY_RESCHEDULE) return "reschedule";
  return null;
}

export const OUTBOX_TOPIC_FRONT_DESK_WHATSAPP = "front_desk.appointment_whatsapp_reply";