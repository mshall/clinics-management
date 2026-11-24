/** GRW-P4-C "Refer a company": client-side checks that mirror the server (the server stays the authority). Company data only. */
export const SIZE_BUCKETS = ["UNKNOWN", "1_49", "50_199", "200_999", "1000_PLUS"] as const;
const toAscii = (t: string) => t.normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
const PERSONAL = [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, /(?:\+|00)?\d[\d\s().-]{8,}\d/, /\b[23]\d{13}\b/];
export const looksPersonal = (text: string): boolean => PERSONAL.some((re) => re.test(toAscii(text)));

export type B2bProblem = "NAME" | "PERSONAL" | "REF_LENGTH" | null;
/** What the form can say before sending: a short name, a person's contact data, a too long reference. */
export function b2bProblem(i: { companyName: string; contactRef: string }): B2bProblem {
  const name = i.companyName.trim();
  if (name.length < 2 || name.length > 120) return "NAME";
  if (looksPersonal(name) || looksPersonal(i.contactRef)) return "PERSONAL";
  if (i.contactRef.trim().length > 80) return "REF_LENGTH";
  return null;
}
export const b2bErrorCode = (e: unknown): string | null => (e as { body?: { code?: string } } | null)?.body?.code ?? null;
