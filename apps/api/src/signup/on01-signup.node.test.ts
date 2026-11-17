import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDisposableEmail } from "./signup-disposable-email";
import { defaultAppointmentTypesForSpecialty } from "./signup-appointment-types";
import { ClinicalSpecialty } from "@prisma/client";
import { normalizeSignupPhone } from "./signup-phone";
import { availabilityWeekFromClinicHours } from "./signup-availability";

describe("ON-01 signup helpers", () => {
  it("rejects disposable email domains", () => {
    assert.equal(isDisposableEmail("x@mailinator.com"), true);
    assert.equal(isDisposableEmail("dr@clinic.example"), false);
  });

  it("normalizes Egypt mobile numbers", () => {
    assert.equal(normalizeSignupPhone("01001234567", "20"), "201001234567");
  });

  it("seeds appointment types per specialty", () => {
    const dental = defaultAppointmentTypesForSpecialty(ClinicalSpecialty.DENTISTRY);
    assert.ok(dental.some((t) => /dental/i.test(t.nameEn)));
    const general = defaultAppointmentTypesForSpecialty(ClinicalSpecialty.GENERAL_MEDICINE);
    assert.equal(general.length, 2);
  });

  it("builds availability from clinic hours skipping weekends", () => {
    const week = availabilityWeekFromClinicHours("09:00", "17:00", [5, 6], "Africa/Cairo") as {
      days: { weekday: number; slots: { start: string; end: string }[] }[];
    };
    assert.equal(week.days[5]?.slots.length, 0);
    assert.equal(week.days[1]?.slots[0]?.start, "09:00");
  });
});