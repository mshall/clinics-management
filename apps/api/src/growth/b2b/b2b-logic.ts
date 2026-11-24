/** Pure rules of the provider B2B referral (GRW-P4-C). Company data only. */
export const SIZE_BUCKETS = ["1_49", "50_199", "200_999", "1000_PLUS", "UNKNOWN"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];
export const DUPLICATE_WINDOW_DAYS = 90;
/** Referrals one organisation may send per rolling day (a flood of leads is a bug or an abuse, never a feature). PROPOSED_DEFAULT. */
export const DAILY_LIMIT = 20;

/** Lower-case letters and digits of any script only: "Nile  Logistics, Ltd." and "nile logistics ltd" are one company. */
export const companyKey = (name: string): string => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const toAscii = (t: string) => t.normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
const PERSONAL = [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, /(?:\+|00)?\d[\d\s().-]{8,}\d/, /\b[23]\d{13}\b/];
/** A line that looks like an e-mail address, a phone number or an Egyptian national id (Arabic-Indic digits included). */
export const looksPersonal = (text: string): boolean => PERSONAL.some((re) => re.test(toAscii(text)));

export interface CleanedReferral { companyName: string; companyKey: string; sizeBucket: SizeBucket; contactRef: string | null }
export type CleanResult = { ok: true; value: CleanedReferral } | { ok: false; code: "INVALID" | "PERSONAL_DATA"; message: string };

export function cleanReferral(i: { companyName?: unknown; sizeBucket?: unknown; contactRef?: unknown }): CleanResult {
  const name = typeof i.companyName === "string" ? i.companyName.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 120) return { ok: false, code: "INVALID", message: "The company name must be 2 to 120 characters" };
  if (!companyKey(name)) return { ok: false, code: "INVALID", message: "The company name needs letters or digits" };
  const size = typeof i.sizeBucket === "string" && (SIZE_BUCKETS as readonly string[]).includes(i.sizeBucket) ? (i.sizeBucket as SizeBucket) : "UNKNOWN";
  if (i.sizeBucket !== undefined && i.sizeBucket !== null && i.sizeBucket !== "" && size === "UNKNOWN" && i.sizeBucket !== "UNKNOWN") return { ok: false, code: "INVALID", message: `sizeBucket must be one of ${SIZE_BUCKETS.join(", ")}` };
  const ref = typeof i.contactRef === "string" ? i.contactRef.trim() : "";
  if (ref.length > 80) return { ok: false, code: "INVALID", message: "The contact reference is at most 80 characters" };
  if (looksPersonal(name) || (ref && looksPersonal(ref))) return { ok: false, code: "PERSONAL_DATA", message: "Refer a company, not a person: use your own reference for the contact (never a name, phone number or e-mail address)" };
  return { ok: true, value: { companyName: name, companyKey: companyKey(name), sizeBucket: size, contactRef: ref || null } };
}
