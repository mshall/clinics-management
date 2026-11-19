import { AppointmentStatus, BookingSource, CommissionChargeStatus } from "@prisma/client";
import { ACTIVE_COMMISSION_CHARGE_STATUSES } from "../kiorex/commission-charge-status";

/** Bookings that came through Kiorex (marketplace, WhatsApp bot) or the clinic's own Kiorex-powered link. */
export const KIOREX_OVERVIEW_SOURCES: readonly BookingSource[] = [
  BookingSource.KIOREX_MARKETPLACE,
  BookingSource.KIOREX_WHATSAPP,
  BookingSource.CLINIC_LINK,
];

const ATTENDED: ReadonlySet<AppointmentStatus> = new Set([AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED]);

export type OverviewAppointmentRow = {
  startsAt: Date;
  status: AppointmentStatus;
  bookingSource: BookingSource;
  isNewPatientAtBooking: boolean | null;
};

export type OverviewChargeRow = {
  amount: { toString(): string } | number;
  status: CommissionChargeStatus;
  attendedAt: Date;
};

export type OverviewViewRow = { day: Date; views: number };

export type KiorexOverviewDay = { date: string; views: number; bookings: number; attended: number };

export type KiorexOverviewFigures = {
  profileViews: number;
  bookings: number;
  bookingsByChannel: { marketplace: number; whatsapp: number; clinicLink: number };
  attended: number;
  noShows: number;
  cancelled: number;
  newPatients: number;
  /** Active charges; `confirmed` (CONFIRMED/BILLED) is what monthly settlement and CR-07 progress use. */
  commission: { amount: number; chargedVisits: number; confirmed: number; pending: number };
  daily: KiorexOverviewDay[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Period figures for the Kiorex tab. Appointments are bucketed by visit start, charges by attendance,
 * views by Kiorex day — all UTC calendar days inside [periodStart, periodEnd).
 */
export function summarizeKiorexOverview(
  periodStart: Date,
  periodEnd: Date,
  appointments: OverviewAppointmentRow[],
  charges: OverviewChargeRow[],
  views: OverviewViewRow[],
): KiorexOverviewFigures {
  const daily = new Map<string, KiorexOverviewDay>();
  for (let d = new Date(periodStart); d < periodEnd; d = new Date(d.getTime() + 86_400_000)) {
    daily.set(dayKey(d), { date: dayKey(d), views: 0, bookings: 0, attended: 0 });
  }
  const inPeriod = (d: Date) => d >= periodStart && d < periodEnd;

  const figures: KiorexOverviewFigures = {
    profileViews: 0,
    bookings: 0,
    bookingsByChannel: { marketplace: 0, whatsapp: 0, clinicLink: 0 },
    attended: 0,
    noShows: 0,
    cancelled: 0,
    newPatients: 0,
    commission: { amount: 0, chargedVisits: 0, confirmed: 0, pending: 0 },
    daily: [],
  };

  for (const a of appointments) {
    if (!inPeriod(a.startsAt) || !KIOREX_OVERVIEW_SOURCES.includes(a.bookingSource)) continue;
    const bucket = daily.get(dayKey(a.startsAt));
    figures.bookings += 1;
    if (bucket) bucket.bookings += 1;
    if (a.bookingSource === BookingSource.KIOREX_MARKETPLACE) figures.bookingsByChannel.marketplace += 1;
    else if (a.bookingSource === BookingSource.KIOREX_WHATSAPP) figures.bookingsByChannel.whatsapp += 1;
    else figures.bookingsByChannel.clinicLink += 1;
    if (ATTENDED.has(a.status)) {
      figures.attended += 1;
      if (bucket) bucket.attended += 1;
      if (a.isNewPatientAtBooking) figures.newPatients += 1;
    } else if (a.status === AppointmentStatus.NO_SHOW) {
      figures.noShows += 1;
    } else if (a.status === AppointmentStatus.CANCELLED) {
      figures.cancelled += 1;
    }
  }

  let confirmed = 0;
  let pending = 0;
  for (const c of charges) {
    if (!inPeriod(c.attendedAt) || !ACTIVE_COMMISSION_CHARGE_STATUSES.has(c.status)) continue;
    const amount = Number(c.amount.toString());
    if (c.status === CommissionChargeStatus.CONFIRMED || c.status === CommissionChargeStatus.BILLED) confirmed += amount;
    else pending += amount;
    figures.commission.chargedVisits += 1;
  }
  figures.commission.confirmed = round2(confirmed);
  figures.commission.pending = round2(pending);
  figures.commission.amount = round2(confirmed + pending);

  for (const v of views) {
    if (!inPeriod(v.day)) continue;
    figures.profileViews += v.views;
    const bucket = daily.get(dayKey(v.day));
    if (bucket) bucket.views += v.views;
  }

  figures.daily = [...daily.values()];
  return figures;
}

export function currentPeriodKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
