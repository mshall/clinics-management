import type { AppointmentStatus, BookingSource } from "@prisma/client";

/** Pure metric helpers for the Growth workspace (no I/O): classification of a booking by who brought the patient, and the performance roll-up. */
export type Origin = "PROVIDER" | "MARKETPLACE" | "OTHER";

export interface AppointmentFacts {
  status: AppointmentStatus;
  bookingSource: BookingSource;
  acquisitionOrigin: "PROVIDER_LED" | "MARKETPLACE" | "UNATTRIBUTED" | null;
  isNewPatientAtBooking: boolean | null;
  feeAmount: number;
  createdAt: Date;
  checkedInAt: Date | null;
}

const MARKETPLACE_SOURCES = new Set<BookingSource>(["KIOREX_MARKETPLACE", "KIOREX_WHATSAPP", "INTEGRATION"]);

/** Provider-led wins: a link/widget booking or a Kiorex booking whose decision says PROVIDER_LED is provider-originated, never charged. */
export function classifyOrigin(a: Pick<AppointmentFacts, "bookingSource" | "acquisitionOrigin">): Origin {
  if (a.bookingSource === "CLINIC_LINK" || a.acquisitionOrigin === "PROVIDER_LED") return "PROVIDER";
  if (MARKETPLACE_SOURCES.has(a.bookingSource)) return "MARKETPLACE";
  return "OTHER";
}

export const isAttended = (a: Pick<AppointmentFacts, "status" | "checkedInAt">) => a.checkedInAt != null || a.status === "CHECKED_IN" || a.status === "COMPLETED";
export const isLost = (a: Pick<AppointmentFacts, "status">) => a.status === "CANCELLED" || a.status === "NO_SHOW";

export interface OriginStats {
  bookings: number;
  attended: number;
  cancelledOrNoShow: number;
  newPatients: number;
  attendedRate: number | null;
  cancellationRate: number | null;
}

const rate = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

function weekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function buildPerformance(rows: AppointmentFacts[], linkTotals: { visits: number; bookings: number; attended: number }) {
  const acc: Record<Origin, { b: number; a: number; l: number; n: number }> = { PROVIDER: { b: 0, a: 0, l: 0, n: 0 }, MARKETPLACE: { b: 0, a: 0, l: 0, n: 0 }, OTHER: { b: 0, a: 0, l: 0, n: 0 } };
  const trend = new Map<string, { week: string; provider: number; marketplace: number }>();
  let incrementalRevenue = 0;
  for (const r of rows) {
    const o = classifyOrigin(r);
    if (o === "OTHER") continue;
    const s = acc[o];
    s.b += 1;
    if (isAttended(r)) s.a += 1;
    if (isLost(r)) s.l += 1;
    if (r.isNewPatientAtBooking) s.n += 1;
    if (o === "MARKETPLACE" && r.isNewPatientAtBooking && isAttended(r)) incrementalRevenue += r.feeAmount;
    const w = weekStart(r.createdAt);
    const t = trend.get(w) ?? { week: w, provider: 0, marketplace: 0 };
    if (o === "PROVIDER") t.provider += 1; else t.marketplace += 1;
    trend.set(w, t);
  }
  const out = (o: Origin): OriginStats => ({
    bookings: acc[o].b,
    attended: acc[o].a,
    cancelledOrNoShow: acc[o].l,
    newPatients: acc[o].n,
    attendedRate: rate(acc[o].a, acc[o].b),
    cancellationRate: rate(acc[o].l, acc[o].b),
  });
  return {
    providerOriginated: out("PROVIDER"),
    marketplaceOriginated: out("MARKETPLACE"),
    links: { ...linkTotals, visitToBooking: rate(linkTotals.bookings, linkTotals.visits), bookingToAttended: rate(linkTotals.attended, linkTotals.bookings) },
    incrementalMarketplaceRevenue: Math.round(incrementalRevenue * 100) / 100,
    trend: [...trend.values()].sort((a, b) => (a.week < b.week ? -1 : 1)),
  };
}
