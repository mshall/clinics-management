import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import "./kiorex-door-i18n";
import type { FrontDoorDto } from "./kiorex-door-types";

export const doorKey = (clinicId: string) => ["kiorex", "front-door", clinicId] as const;
export const useFrontDoor = (clinicId: string) =>
  useQuery({ queryKey: doorKey(clinicId), queryFn: () => apiGet<FrontDoorDto>(`/api/v1/kiorex/front-door?clinicId=${encodeURIComponent(clinicId)}`), enabled: Boolean(clinicId), retry: false, refetchInterval: (q) => (q.state.data?.state === "WAITING" ? 15_000 : false) });

/** "12 000" style number in the page language. */
export const fmtNumber = (n: number, lang: string): string => new Intl.NumberFormat(lang.startsWith("ar") ? "ar-EG" : "en").format(n);

export function feeSentence(feeCard: { currency?: string; rates?: Array<{ specialty: string | null; feeType: string; amount: string | null; percent: string | null }>; items?: Array<{ specialty: string | null; feeType: string; amount: string | null; percent: string | null }>; defaultRate?: { specialty: string | null; feeType: string; amount: string | null; percent: string | null } | null } | null | undefined, lang: string): string | null {
  const rows = feeCard?.rates ?? feeCard?.items ?? (feeCard?.defaultRate ? [feeCard.defaultRate] : []);
  const r = rows.find((x) => x.specialty == null) ?? rows[0];
  if (!r) return null;
  const nf = new Intl.NumberFormat(lang.startsWith("ar") ? "ar-EG" : "en");
  if (r.feeType === "PERCENT" && r.percent) return `${nf.format(Number(r.percent))}%`;
  if (r.amount) return `${feeCard?.currency ?? "EGP"} ${nf.format(Number(r.amount))}`;
  return null;
}
