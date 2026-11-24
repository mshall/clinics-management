import type { SocialTemplateKind } from "@prisma/client";

/**
 * GRW-P2-C seed catalogue: 6 approved templates, each in Arabic and English (12 rows). Platform-authored, no tenant column. Wording rules (tested):
 * no guarantee, cure, price comparison, testimonial, before-and-after, pressure or extra-treatment language, and every row passes `checkContent`.
 * The text only invites a patient to see availability; it never describes a treatment outcome. Egyptian medical-advertising review is a human item.
 * Placeholders: {clinic}, {doctor} (doctor templates only), {link}. `protectedFooter` is appended by the renderer and cannot be edited by a provider.
 */
export interface SeedTemplate {
  slug: string;
  kind: SocialTemplateKind;
  layoutKey: "post" | "story" | "flyer" | "plain";
  doctor: boolean;
  en: { title: string; body: string };
  ar: { title: string; body: string };
}

export const PROTECTED_FOOTER = {
  en: "Appointments depend on availability and are confirmed by the clinic. This is not medical advice.",
  ar: "المواعيد حسب التوافر وتؤكدها العيادة. هذه المعلومات ليست نصيحة طبية.",
} as const;

export const SEED_TEMPLATES: readonly SeedTemplate[] = [
  {
    slug: "booking-open",
    kind: "POST",
    layoutKey: "post",
    doctor: false,
    en: { title: "Online booking is open", body: "Online booking is open at {clinic}. See available times and choose the one that suits you: {link}" },
    ar: { title: "الحجز أونلاين متاح", body: "الحجز أونلاين متاح الآن في {clinic}. شاهد المواعيد المتاحة واختر الوقت المناسب لك: {link}" },
  },
  {
    slug: "doctor-intro",
    kind: "POST",
    layoutKey: "post",
    doctor: true,
    en: { title: "Meet the doctor", body: "{doctor} sees patients at {clinic}. Check the next available times and book online: {link}" },
    ar: { title: "تعرّف على الطبيب", body: "{doctor} يستقبل المرضى في {clinic}. اطّلع على أقرب المواعيد المتاحة واحجز أونلاين: {link}" },
  },
  {
    slug: "story-book",
    kind: "STORY",
    layoutKey: "story",
    doctor: false,
    en: { title: "Book your visit", body: "Book your visit at {clinic}. Scan the code or open the link: {link}" },
    ar: { title: "احجز زيارتك", body: "احجز زيارتك في {clinic}. امسح الرمز أو افتح الرابط: {link}" },
  },
  {
    slug: "flyer-find-us",
    kind: "FLYER",
    layoutKey: "flyer",
    doctor: false,
    en: { title: "Find us and book online", body: "{clinic}. Book a visit online, any time of day: {link}" },
    ar: { title: "احجز معنا أونلاين", body: "{clinic}. احجز زيارتك أونلاين في أي وقت: {link}" },
  },
  {
    slug: "whatsapp-invite",
    kind: "WHATSAPP_MESSAGE",
    layoutKey: "plain",
    doctor: false,
    en: { title: "WhatsApp invitation", body: "Hello, you can now book a visit at {clinic} online and see the available times: {link}" },
    ar: { title: "دعوة عبر واتساب", body: "أهلاً، يمكنك الآن حجز زيارة في {clinic} أونلاين ومعرفة المواعيد المتاحة: {link}" },
  },
  {
    slug: "sms-book",
    kind: "SMS_TEXT",
    layoutKey: "plain",
    doctor: false,
    en: { title: "SMS invitation", body: "{clinic}: book online and see available times {link}" },
    ar: { title: "رسالة نصية", body: "{clinic}: احجز أونلاين وشاهد المواعيد المتاحة {link}" },
  },
];

/** Slot-card wording (used by `shareable-slots.service`): the times are inserted by the server, never typed by the provider. */
export const SLOT_CARD_TEXT = {
  en: { title: "Next available times", intro: "Next available times at {clinic}", cta: "Tap to book", footerLink: "{link}" },
  ar: { title: "أقرب المواعيد المتاحة", intro: "أقرب المواعيد المتاحة في {clinic}", cta: "اضغط للحجز", footerLink: "{link}" },
} as const;

export function fillPlaceholders(text: string, vars: { clinic: string; doctor?: string; link: string }): string {
  return text.replace(/\{clinic\}/g, vars.clinic).replace(/\{doctor\}/g, vars.doctor ?? vars.clinic).replace(/\{link\}/g, vars.link);
}
