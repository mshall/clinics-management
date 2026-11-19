/** MS-06 — Egyptian Arabic WhatsApp AI receptionist intents (pure, no LLM). */

export type ReceptionistIntentKind =
  | "BOOKING"
  | "RESCHEDULE"
  | "PRICES"
  | "LOCATION"
  | "HOURS"
  | "CLINICAL"
  | "HANDOVER"
  | "UNKNOWN";

const CLINICAL =
  /(diagnos|symptom|prescription|medication|دواء|علاج|تشخيص|أعراض|ألم|الم|وجع|تحليل|أشعه|اشعة|هل عندي|ايه المرض|نصيحة طبية|medical advice|what should i take)/i;

const HANDOVER = /(موظف|بشري|speak to (a )?human|talk to (a )?person|handover|حولني|كلم حد|reception)/i;

const BOOKING = /(احجز|أحجز|حجز|موعد|book(ing)?|appointment|عايز\s*أ?حجز|عاوزة\s*أ?حجز)/i;
const RESCHEDULE = /(تأجيل|تاجيل|تغيير الموعد|أعد الجدولة|اعادة جدولة|reschedul|postpone|change (my )?appointment)/i;
const PRICES = /(سعر|أسعار|اسعار|كام|تكلفة|price|fee|cost|كشف)/i;
const LOCATION = /(عنوان|فين|موقع|location|address|maps|الخريطة|الموقع)/i;
const HOURS = /(مواعيد العمل|ساعات العمل|فتحين|بتفتح|closing|opening|hours|متى تفتحون)/i;

export function classifyReceptionistIntent(text: string): ReceptionistIntentKind {
  const t = text.trim();
  if (!t) return "UNKNOWN";
  if (CLINICAL.test(t)) return "CLINICAL";
  if (HANDOVER.test(t)) return "HANDOVER";
  if (RESCHEDULE.test(t)) return "RESCHEDULE";
  if (BOOKING.test(t)) return "BOOKING";
  if (PRICES.test(t)) return "PRICES";
  if (LOCATION.test(t)) return "LOCATION";
  if (HOURS.test(t)) return "HOURS";
  return "UNKNOWN";
}

export function clinicalHandoverReplyAr(): string {
  return (
    "مش هقدر أدي نصيحة طبية أو أشخّص من الواتساب. " +
    "هحوّلك لموظف الاستقبال عشان يساعدوك بشكل آمن. " +
    "لو حالة طارئة روّح لأقرب طوارئ."
  );
}

export function staffHandoverReplyAr(): string {
  return "تمام، هحوّلك لموظف الاستقبال دلوقتي. هيتواصلوا معاك في أقرب وقت.";
}

export function unknownReplyAr(): string {
  return (
    "أهلاً بيك 👋 أقدر أساعدك في الحجز، تغيير الموعد، الأسعار، العنوان، أو مواعيد العمل. " +
    "لو سؤالك طبي هحوّلك لموظف الاستقبال."
  );
}
