import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookedMinutes,
  bookingSourceMix,
  newVsReturning,
  noShowRate,
  noShowRateByDoctor,
  revenuePerDoctorHour,
  utilisationPercent,
  type OpsAppointmentRow,
} from "./operations-kpis";

function row(partial: Partial<OpsAppointmentRow> & Pick<OpsAppointmentRow, "id" | "status" | "startsAt">): OpsAppointmentRow {
  return {
    clinicianId: "dr1",
    appointmentTypeId: "type1",
    endsAt: new Date(partial.startsAt.getTime() + 30 * 60_000),
    bookingSource: "FRONT_DESK",
    isNewPatientAtBooking: false,
    ...partial,
  };
}

describe("RP-01 operational KPIs", () => {
  it("no-show rate reconciles with raw COMPLETED + NO_SHOW rows", () => {
    const day = new Date("2026-11-10T09:00:00.000Z");
    const rows = [
      row({ id: "1", status: "COMPLETED", startsAt: day }),
      row({ id: "2", status: "COMPLETED", startsAt: day }),
      row({ id: "3", status: "NO_SHOW", startsAt: day }),
      row({ id: "4", status: "CANCELLED", startsAt: day }),
    ];
    const kpi = noShowRate(rows);
    assert.equal(kpi.total, 3);
    assert.equal(kpi.noShows, 1);
    assert.equal(kpi.rate, 33.3);
    assert.equal(noShowRateByDoctor(rows)[0]!.noShows, 1);
  });

  it("utilisation and revenue per doctor-hour match booked minutes", () => {
    const start = new Date("2026-11-10T09:00:00.000Z");
    const rows = [
      row({ id: "1", status: "COMPLETED", startsAt: start, durationMinutes: 60 }),
      row({ id: "2", status: "CONFIRMED", startsAt: new Date(start.getTime() + 3_600_000), durationMinutes: 30 }),
    ];
    const booked = bookedMinutes(rows);
    assert.equal(booked, 90);
    assert.equal(utilisationPercent(booked, 180), 50);
    assert.equal(revenuePerDoctorHour(450, booked), 300);
  });

  it("new vs returning and booking source mix include Kiorex", () => {
    const start = new Date("2026-11-10T09:00:00.000Z");
    const rows = [
      row({ id: "1", status: "COMPLETED", startsAt: start, isNewPatientAtBooking: true, bookingSource: "KIOREX" }),
      row({ id: "2", status: "COMPLETED", startsAt: start, isNewPatientAtBooking: false, bookingSource: "FRONT_DESK" }),
      row({ id: "3", status: "COMPLETED", startsAt: start, isNewPatientAtBooking: true, bookingSource: "CLINIC_LINK" }),
    ];
    assert.deepEqual(newVsReturning(rows), { newPatients: 2, returning: 1 });
    const mix = bookingSourceMix(rows);
    assert.equal(mix.find((m) => m.source === "KIOREX")?.count, 1);
    assert.equal(mix.reduce((n, m) => n + m.count, 0), 3);
  });
});
