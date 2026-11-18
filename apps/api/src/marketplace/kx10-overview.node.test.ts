import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CommissionChargeStatus } from "@prisma/client";
import { summarizeKiorexOverview } from "./kiorex-overview";

const start = new Date("2026-07-01T00:00:00.000Z");
const end = new Date("2026-08-01T00:00:00.000Z");
const at = (d: string) => new Date(`2026-07-${d}T09:00:00.000Z`);

describe("KX-10 Kiorex overview aggregation", () => {
  it("counts only Kiorex-sourced visits in the period, by channel and outcome", () => {
    const f = summarizeKiorexOverview(
      start,
      end,
      [
        { startsAt: at("02"), status: AppointmentStatus.COMPLETED, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true },
        { startsAt: at("02"), status: AppointmentStatus.CHECKED_IN, bookingSource: BookingSource.CLINIC_LINK, isNewPatientAtBooking: true },
        { startsAt: at("03"), status: AppointmentStatus.NO_SHOW, bookingSource: BookingSource.KIOREX_WHATSAPP, isNewPatientAtBooking: true },
        { startsAt: at("04"), status: AppointmentStatus.CANCELLED, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: false },
        { startsAt: at("05"), status: AppointmentStatus.COMPLETED, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: false },
        { startsAt: at("05"), status: AppointmentStatus.COMPLETED, bookingSource: BookingSource.FRONT_DESK, isNewPatientAtBooking: true },
        { startsAt: new Date("2026-08-01T00:00:00.000Z"), status: AppointmentStatus.COMPLETED, bookingSource: BookingSource.KIOREX_MARKETPLACE, isNewPatientAtBooking: true },
      ],
      [],
      [],
    );
    assert.equal(f.bookings, 5);
    assert.deepEqual(f.bookingsByChannel, { marketplace: 3, whatsapp: 1, clinicLink: 1 });
    assert.equal(f.attended, 3);
    assert.equal(f.noShows, 1);
    assert.equal(f.cancelled, 1);
    assert.equal(f.newPatients, 2);
    assert.equal(f.daily.length, 31);
    assert.deepEqual(f.daily[1], { date: "2026-07-02", views: 0, bookings: 2, attended: 2 });
  });

  it("sums active charges split into confirmed and pending; reversed or waived are excluded", () => {
    const f = summarizeKiorexOverview(
      start,
      end,
      [],
      [
        { amount: 75, status: CommissionChargeStatus.CONFIRMED, attendedAt: at("02") },
        { amount: "50.5", status: CommissionChargeStatus.PENDING, attendedAt: at("03") },
        { amount: 20, status: CommissionChargeStatus.DISPUTED, attendedAt: at("03") },
        { amount: 99, status: CommissionChargeStatus.REVERSED, attendedAt: at("04") },
        { amount: 99, status: CommissionChargeStatus.WAIVED, attendedAt: at("04") },
        { amount: 10, status: CommissionChargeStatus.BILLED, attendedAt: at("05") },
        { amount: 10, status: CommissionChargeStatus.BILLED, attendedAt: new Date("2026-06-30T23:00:00.000Z") },
      ],
      [
        { day: new Date("2026-07-02T00:00:00.000Z"), views: 12 },
        { day: new Date("2026-07-03T00:00:00.000Z"), views: 8 },
        { day: new Date("2026-06-30T00:00:00.000Z"), views: 100 },
      ],
    );
    assert.deepEqual(f.commission, { amount: 155.5, chargedVisits: 4, confirmed: 85, pending: 70.5 });
    assert.equal(f.profileViews, 20);
    assert.equal(f.daily[1]!.views, 12);
  });
});
