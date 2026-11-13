import { messageAsksForPatientCount } from "./assistant-intent";

const MRN_RE = /\b(MRN-\d+)\b/i;
const PHONE_RE = /(?:\+?\d[\d\s-]{7,}\d)/;
const QUOTED_RE = /"([^"]{2,80})"|'([^']{2,80})'/;
const CUID_RE = /\b(c[a-z0-9]{20,})\b/i;

export function messageAsksForPatientLookup(message: string): boolean {
  if (messageAsksForPatientCount(message)) return false;
  const m = message.toLowerCase();
  const hasPatient =
    /\bpatient(s)?\b/.test(m) ||
    /\bmrn\b/.test(m) ||
    /مريض/.test(message) ||
    /السجل الطبي/.test(message);
  if (!hasPatient && !MRN_RE.test(message)) return false;

  const wantsLookup =
    /detail|info|information|find|search|show|lookup|open|who is|record|chart|named|called|about|phone|national id|identifier/i.test(
      m,
    ) ||
    /(ما|معلومات|ابحث|اعرض|تفاصيل).*(مريض|mrn)/iu.test(message) ||
    MRN_RE.test(message) ||
    QUOTED_RE.test(message) ||
    CUID_RE.test(message) ||
    /patient\s+[\p{L}]/iu.test(message);

  return wantsLookup;
}

export function extractPatientSearchTerm(message: string): string {
  const mrn = message.match(MRN_RE)?.[1];
  if (mrn) return mrn;

  const quoted = message.match(QUOTED_RE);
  if (quoted) return (quoted[1] ?? quoted[2] ?? "").trim();

  const cuid = message.match(CUID_RE)?.[1];
  if (cuid && /patient|mrn|detail|find|search|show|مريض/i.test(message)) return cuid;

  const phone = message.match(PHONE_RE)?.[0];
  if (phone && /phone|mobile|tel|جوال|هاتف/i.test(message)) {
    return phone.replace(/\s+/g, " ").trim();
  }

  let t = message.trim();
  const stripPrefixes = [
    /^(please\s+)?(can you\s+)?(help me\s+)?(find|search|show|get|lookup|open)\s+(me\s+)?(the\s+)?/i,
    /^(patient\s+)?(details?|info(?:rmation)?|record|chart)\s+(for|of|about)\s+/i,
    /^patient\s+(named|called)\s+/i,
    /^(who is|details on)\s+(the\s+)?patient\s+/i,
    /^مريض\s+(اسمه|يدعى|اسم)\s+/u,
    /^(ابحث|اعرض|اعطني)\s+(عن\s+)?(المريض|مريض)\s*/u,
  ];
  for (const re of stripPrefixes) {
    t = t.replace(re, "");
  }
  t = t.replace(/\bpatient(s)?\b/gi, "").replace(/\b(mrn|medical record number)\b/gi, "").trim();
  t = t.replace(/[?.!]+$/, "").trim();

  if (t.length >= 2) return t;
  const phoneFallback = message.match(PHONE_RE)?.[0];
  if (phoneFallback) return phoneFallback.replace(/\s+/g, " ").trim();
  return message.trim();
}
