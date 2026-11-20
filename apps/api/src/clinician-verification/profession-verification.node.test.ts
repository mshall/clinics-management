import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Profession, VerificationStatus } from "@prisma/client";
import { EG_PROFESSION_PACK } from "../scope-of-practice/profession-pack";
import {
  computeNextReverifyAt,
  dueReminderStage,
  effectiveVerificationStatus,
  isReverificationOverdue,
  registrationNumberValid,
  reverifyReasonForChange,
  verificationBadge,
} from "./profession-verification";

const P = EG_PROFESSION_PACK;

describe("PRVER02 badge names the profession", () => {
  it("Verified physiotherapist / nurse; unverified shows the profession but not verified", () => {
    const b = verificationBadge(P, Profession.PHYSIOTHERAPIST, VerificationStatus.VERIFIED);
    assert.deepEqual([b.verified, b.labelEn], [true, "Verified physiotherapist"]);
    assert.ok(b.labelAr.length > 0);
    assert.equal(verificationBadge(P, Profession.NURSE, VerificationStatus.PENDING).verified, false);
    assert.equal(verificationBadge(P, Profession.ASSISTANT, VerificationStatus.VERIFIED).verified, false);
    assert.equal(verificationBadge(P, null, null).verified, false);
  });
});

describe("listing gate: verified for the CURRENT profession", () => {
  it("profession mismatch or assistant downgrades VERIFIED to PENDING; legacy rows (no verifiedProfession) still count", () => {
    const v = (verifiedProfession: Profession | null) => ({ status: VerificationStatus.VERIFIED, verifiedProfession });
    assert.equal(effectiveVerificationStatus(v(Profession.PHYSICIAN), Profession.PHYSICIAN, P), VerificationStatus.VERIFIED);
    assert.equal(effectiveVerificationStatus(v(Profession.PHYSICIAN), Profession.PHYSIOTHERAPIST, P), VerificationStatus.PENDING);
    assert.equal(effectiveVerificationStatus(v(null), Profession.PHYSICIAN, P), VerificationStatus.VERIFIED);
    assert.equal(effectiveVerificationStatus(v(Profession.NURSE), Profession.ASSISTANT, P), VerificationStatus.PENDING);
    assert.equal(effectiveVerificationStatus(v(null), null, P), VerificationStatus.PENDING);
    assert.equal(effectiveVerificationStatus({ status: VerificationStatus.REJECTED, verifiedProfession: null }, Profession.PHYSICIAN, P), VerificationStatus.REJECTED);
    assert.equal(effectiveVerificationStatus(null, Profession.PHYSICIAN, P), null);
  });
});

describe("PRVER03 re-verification schedule", () => {
  const verifiedAt = new Date("2026-01-15T00:00:00Z");
  it("next re-verification is the earlier of interval and licence expiry", () => {
    assert.equal(computeNextReverifyAt(P, verifiedAt, []).toISOString(), "2027-01-15T00:00:00.000Z");
    assert.equal(computeNextReverifyAt(P, verifiedAt, [new Date("2026-09-01T00:00:00Z")]).toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(computeNextReverifyAt(P, verifiedAt, [new Date("2030-01-01T00:00:00Z"), null]).toISOString(), "2027-01-15T00:00:00.000Z");
  });

  it("reminders fire once per stage at 60 / 30 / 7 days", () => {
    const exp = new Date("2026-12-31T00:00:00Z");
    const at = (iso: string) => new Date(iso);
    assert.equal(dueReminderStage(P, exp, at("2026-10-01T00:00:00Z"), 0), null);
    assert.deepEqual(dueReminderStage(P, exp, at("2026-11-02T00:00:00Z"), 0)?.stage, 1);
    assert.equal(dueReminderStage(P, exp, at("2026-11-03T00:00:00Z"), 1), null, "same stage is not repeated");
    assert.equal(dueReminderStage(P, exp, at("2026-12-05T00:00:00Z"), 1)?.stage, 2);
    assert.equal(dueReminderStage(P, exp, at("2026-12-26T00:00:00Z"), 2)?.stage, 3);
    assert.equal(dueReminderStage(P, exp, at("2026-12-30T00:00:00Z"), 3), null);
  });

  it("overdue detection", () => {
    assert.equal(isReverificationOverdue(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z")), true);
    assert.equal(isReverificationOverdue(new Date("2026-02-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z")), false);
    assert.equal(isReverificationOverdue(null, new Date()), false);
  });

  it("H11: name, profession or specialty change forces re-verification", () => {
    const base = { name: "Dr A", profession: Profession.PHYSICIAN as Profession | null, specialty: "GENERAL_MEDICINE" as string | null };
    assert.equal(reverifyReasonForChange(base, { ...base }), null);
    assert.equal(reverifyReasonForChange(base, { ...base, name: "Dr B" }), "NAME_CHANGED");
    assert.equal(reverifyReasonForChange(base, { ...base, profession: Profession.DENTIST }), "PROFESSION_CHANGED");
    assert.equal(reverifyReasonForChange(base, { ...base, specialty: "DENTISTRY" }), "SPECIALTY_CHANGED");
  });
});

describe("PRVER01 registration number format", () => {
  it("syndicate format accepts typical numbers and rejects garbage", () => {
    const rule = P.verification.PHYSIOTHERAPIST.registers[0]!;
    assert.equal(registrationNumberValid(rule, "PT-12345"), true);
    assert.equal(registrationNumberValid(rule, "  "), false);
    assert.equal(registrationNumberValid(rule, "!!"), false);
  });
});
