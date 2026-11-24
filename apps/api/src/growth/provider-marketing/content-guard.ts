/**
 * GRW-P2-C content guard for provider-facing social and share content. A CLOSED, auditable deny list (no model, no scoring): marketing text that reaches the
 * public may not promise results, claim cures, compare prices, quote or fabricate testimonials, show before-and-after results, pressure the reader, or push
 * extra treatment. Egyptian medical-advertising rules need a human review (NEEDS_HUMAN); until then this list is deliberately strict.
 * Matching is on normalised text (case folded, Arabic diacritics and tatweel removed, alef and yeh variants unified, digits unified), so simple obfuscation
 * ("GUARANTEE", "ضـمـان", "١٠٠٪") does not slip through. The list lives in `Docs/growth/content-guard-terms.md` for review.
 */
export type GuardCategory = "GUARANTEE" | "CURE" | "COMPARISON" | "TESTIMONIAL" | "BEFORE_AFTER" | "PRESSURE" | "OVERTREATMENT" | "SUPERLATIVE";

export interface GuardTerm {
  id: string;
  category: GuardCategory;
  en?: string[];
  ar?: string[];
  /** Regex source on the normalised text (both languages), used for patterns a plain phrase cannot express. */
  pattern?: string;
}

export const GUARD_TERMS: readonly GuardTerm[] = [
  { id: "guarantee", category: "GUARANTEE", en: ["guarantee", "guaranteed", "guarantees", "risk free", "no risk", "assured result", "promise results"], ar: ["ضمان", "نضمن", "مضمون", "مضمونه", "بدون مخاطر", "نتيجه مؤكده"], pattern: "100\\s*%|مائه بالمائه|مية بالمية" },
  { id: "cure", category: "CURE", en: ["cure", "cures", "cured", "permanent cure", "miracle", "miraculous", "heals completely", "complete recovery", "eliminates disease"], ar: ["علاج نهائي", "شفاء تام", "شفاء كامل", "نشفيك", "معجزه", "معجزة", "نقضي علي المرض", "علاج جذري"] },
  { id: "comparison", category: "COMPARISON", en: ["cheapest", "lowest price", "lowest fees", "cheaper than", "better than other", "best price", "price match", "half price"], ar: ["الارخص", "ارخص", "اقل سعر", "ارخص من", "افضل سعر", "اسعار منافسه", "نص السعر", "نصف السعر"] },
  { id: "superlative", category: "SUPERLATIVE", en: ["best doctor", "best clinic", "number one", "no. 1", "#1", "top doctor", "leading doctor", "the best"], ar: ["افضل دكتور", "افضل طبيب", "افضل عياده", "رقم واحد", "الاول في", "الاحسن"] },
  { id: "testimonial", category: "TESTIMONIAL", en: ["testimonial", "testimonials", "patients say", "what our patients say", "my patient said", "reviews say", "5 star", "five star", "rated by patients"], ar: ["شهادات المرضي", "شهادة مريض", "اراء المرضي", "المرضي يقولون", "قال لي مريض", "تقييم ٥ نجوم", "5 نجوم"] },
  { id: "before-after", category: "BEFORE_AFTER", en: ["before and after", "before/after", "before & after", "results gallery", "transformation"], ar: ["قبل وبعد", "قبل و بعد", "صور النتائج", "نتائج حقيقيه"] },
  { id: "pressure", category: "PRESSURE", en: ["hurry", "limited time", "last chance", "only today", "act now", "don't miss", "dont miss", "while stocks last", "slots running out", "book now or"], ar: ["الحق", "فرصه اخيره", "لفتره محدوده", "اليوم فقط", "لا تفوت", "قبل ما تخلص", "العرض ينتهي"] },
  { id: "overtreatment", category: "OVERTREATMENT", en: ["extra treatment", "additional procedures", "upgrade your treatment", "unlimited sessions", "full body check", "buy a package", "package deal", "free procedure"], ar: ["جلسات اضافيه", "اجراءات اضافيه", "باقه علاجيه", "جلسات غير محدوده", "اجراء مجاني", "فحص شامل مجاني"] },
];

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/** Case fold, strip Arabic marks and tatweel, unify alef/yeh/teh-marbuta, map Arabic-Indic digits to ASCII, collapse whitespace and zero-width characters. */
export function normalizeForGuard(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(DIACRITICS, "")
    .replace(/ـ/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/٪/g, "%")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface GuardFinding {
  id: string;
  category: GuardCategory;
  term: string;
}

const isWordChar = (c: string | undefined) => (c ? /[a-z0-9؀-ۿ]/.test(c) : false);

function hasPhrase(hay: string, phrase: string): boolean {
  const needle = normalizeForGuard(phrase);
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    // whole-word match for letters/digits (so "cure" does not hit "secure", "#1" and "5 star" still work)
    const before = hay[i - 1];
    const after = hay[i + needle.length];
    const startsWord = isWordChar(needle[0]);
    const endsWord = isWordChar(needle[needle.length - 1]);
    if ((!startsWord || !isWordChar(before)) && (!endsWord || !isWordChar(after))) return true;
    from = i + 1;
  }
}

/** Every deny-list hit in the text (empty array = clean). Deterministic and pure. */
export function checkContent(text: string): GuardFinding[] {
  const hay = normalizeForGuard(text);
  const out: GuardFinding[] = [];
  for (const t of GUARD_TERMS) {
    for (const p of [...(t.en ?? []), ...(t.ar ?? [])]) {
      if (hasPhrase(hay, p)) out.push({ id: t.id, category: t.category, term: p });
    }
    if (t.pattern && new RegExp(t.pattern, "u").test(hay)) out.push({ id: t.id, category: t.category, term: t.pattern });
  }
  return out;
}

export class ContentGuardError extends Error {
  constructor(readonly findings: GuardFinding[]) {
    super("CONTENT_NOT_ALLOWED");
  }
}

/** Throws ContentGuardError when anything matches. */
export function assertContentAllowed(text: string): void {
  const f = checkContent(text);
  if (f.length) throw new ContentGuardError(f);
}

/** Free text a provider may add to a share card or caption: short, single line, no markup, no URLs (the tracked link is added by the server). */
export const CUSTOM_LINE_MAX = 140;
export function sanitizeCustomLine(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_LINE_MAX);
}
