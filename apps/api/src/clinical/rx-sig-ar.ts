const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits(text: string): string {
  return text.replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]!);
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06ff]/.test(text);
}

/** Ordered: longer / more specific phrases first so "twice daily" wins over "daily". */
const SIG_PHRASES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
  [/\b(?:q\.?\s?(\d{1,2})\s?h|every\s+(\d{1,2})\s+hours?)\b/i, (m) => `كل ${m[1] ?? m[2]} ساعات`],
  [/\b(?:for\s+)?(\d{1,3})\s+days?\b/i, (m) => `لمدة ${m[1]} أيام`],
  [/\b(?:for\s+)?(\d{1,2})\s+weeks?\b/i, (m) => `لمدة ${m[1]} أسابيع`],
  [/\b(?:once\s+(?:a\s+)?daily|once\s+a\s+day|o\.?d\.?|q\.?d\.?)\b/i, "مرة واحدة يومياً"],
  [/\b(?:twice\s+(?:a\s+)?daily|twice\s+a\s+day|b\.?i\.?d\.?)\b/i, "مرتين يومياً"],
  [/\b(?:three\s+times\s+(?:a\s+)?daily|three\s+times\s+a\s+day|t\.?i\.?d\.?)\b/i, "ثلاث مرات يومياً"],
  [/\b(?:four\s+times\s+(?:a\s+)?daily|four\s+times\s+a\s+day|q\.?i\.?d\.?)\b/i, "أربع مرات يومياً"],
  [/\b(?:as\s+needed|when\s+needed|p\.?r\.?n\.?)\b/i, "عند اللزوم"],
  [/\b(?:at\s+bedtime|before\s+sleep|h\.?s\.?)\b/i, "قبل النوم"],
  [/\bbefore\s+(?:meals?|food|eating)\b|\ba\.?c\.?\b/i, "قبل الأكل"],
  [/\bafter\s+(?:meals?|food|eating)\b|\bp\.?c\.?\b/i, "بعد الأكل"],
  [/\bwith\s+(?:meals?|food)\b/i, "مع الأكل"],
  [/\bin\s+the\s+morning\b/i, "صباحاً"],
  [/\bat\s+night\b|\bin\s+the\s+evening\b/i, "مساءً"],
  [/\bdaily\b/i, "يومياً"],
  [/\bstat\b/i, "فوراً"],
];

/**
 * Best-effort Arabic rendering of a prescription sig (frequency / duration / instructions).
 * Text that is already Arabic is kept; unknown English text is returned as null so the
 * printed Rx shows the doctor's original wording instead of a guessed translation.
 */
export function sigToArabic(text: string | null | undefined): string | null {
  const raw = text?.trim();
  if (!raw) return null;
  if (hasArabic(raw)) return toArabicDigits(raw);
  let rest = raw;
  const parts: string[] = [];
  for (const [re, out] of SIG_PHRASES) {
    const m = rest.match(re);
    if (!m) continue;
    parts.push(typeof out === "string" ? out : out(m));
    rest = rest.replace(re, " ");
  }
  if (!parts.length) return null;
  const leftover = rest.replace(/[\s,;.\-–—]+/g, " ").replace(/\b(?:and|then|x)\b/gi, " ").trim();
  if (leftover && /[a-z]{3,}/i.test(leftover)) return null;
  return toArabicDigits(parts.join("، "));
}

/** Arabic instruction line for one printed item; falls back to the catalog's Arabic default sig. */
export function arabicInstructionLine(input: {
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  defaultSigAr?: string | null;
}): string | null {
  const pieces = [sigToArabic(input.frequency), sigToArabic(input.duration), sigToArabic(input.instructions)].filter(
    (p): p is string => Boolean(p),
  );
  if (pieces.length) return pieces.join(" — ");
  const fallback = input.defaultSigAr?.trim();
  return fallback ? toArabicDigits(fallback) : null;
}
