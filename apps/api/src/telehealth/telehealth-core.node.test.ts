import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attendanceThresholdMs, isPastNoShowDeadline, joinWindow, windowState } from "./telehealth-window";
import { patientJoinUrl, signTelehealthToken, verifyTelehealthToken } from "./telehealth-token";
import { parseTelehealthWindows, slotInsideWindows } from "./telehealth-availability";
import { outboxTargetFor, telehealthBlock, telehealthMissedData } from "./telehealth-events";

process.env.JWT_SECRET = "unit-test-jwt-secret-with-enough-length-0123456789";
const T0 = new Date("2026-12-01T10:00:00Z");
const END = new Date("2026-12-01T10:30:00Z");

describe("ADR-039 join window (computed, never stored)", () => {
  it("opens 10 minutes before start and closes 60 minutes after scheduled end", () => {
    const w = joinWindow(T0, END);
    assert.equal(w.opensAt.toISOString(), "2026-12-01T09:50:00.000Z");
    assert.equal(w.closesAt.toISOString(), "2026-12-01T11:30:00.000Z");
    assert.equal(windowState(new Date("2026-12-01T09:49:59Z"), w), "TOO_EARLY");
    assert.equal(windowState(new Date("2026-12-01T09:50:00Z"), w), "OPEN");
    assert.equal(windowState(new Date("2026-12-01T11:30:01Z"), w), "EXPIRED");
  });

  it("a reschedule moves the window and the SAME token keeps working (window is not in the token)", () => {
    const s = { id: "sess1", patientId: "pat1", linkVersion: 1 };
    const token = signTelehealthToken({ s: s.id, p: s.patientId, v: s.linkVersion });
    const before = joinWindow(T0, END);
    const movedStart = new Date(T0.getTime() + 24 * 3600_000);
    const after = joinWindow(movedStart, new Date(END.getTime() + 24 * 3600_000));
    assert.equal(windowState(T0, before), "OPEN");
    assert.equal(windowState(T0, after), "TOO_EARLY"); // old slot is now too early for the new window
    assert.ok(verifyTelehealthToken(token), "token unchanged and still valid");
    assert.equal(windowState(movedStart, after), "OPEN");
  });

  it("defaults to 30 minutes when the appointment has no end", () => {
    assert.equal(joinWindow(T0, null).scheduledEnd.toISOString(), "2026-12-01T10:30:00.000Z");
  });

  it("no-show deadline is start + configured minutes", () => {
    assert.equal(isPastNoShowDeadline(new Date("2026-12-01T10:14:59Z"), T0, 15), false);
    assert.equal(isPastNoShowDeadline(new Date("2026-12-01T10:15:00Z"), T0, 15), true);
    assert.equal(isPastNoShowDeadline(new Date("2026-12-01T10:15:00Z"), T0, 30), false);
  });

  it("attendance threshold is 3 minutes (overridable for tests)", () => {
    delete process.env.TELEHEALTH_ATTENDANCE_SECONDS;
    assert.equal(attendanceThresholdMs(), 180_000);
    process.env.TELEHEALTH_ATTENDANCE_SECONDS = "10";
    assert.equal(attendanceThresholdMs(), 10_000);
    delete process.env.TELEHEALTH_ATTENDANCE_SECONDS;
  });
});

describe("ADR-039 link token", () => {
  it("round-trips, carries no times, rejects tampering and garbage", () => {
    const t = signTelehealthToken({ s: "s1", p: "p1", v: 3 });
    assert.deepEqual(verifyTelehealthToken(t), { s: "s1", p: "p1", v: 3 });
    const body = JSON.parse(Buffer.from(t.split(".")[0]!, "base64url").toString());
    assert.deepEqual(Object.keys(body).sort(), ["p", "s", "v"]);
    assert.equal(verifyTelehealthToken(t.slice(0, -2) + "xx"), null);
    const forged = Buffer.from(JSON.stringify({ s: "s1", p: "p1", v: 9 })).toString("base64url") + "." + t.split(".")[1];
    assert.equal(verifyTelehealthToken(forged), null);
    for (const g of ["", "a", "a.b.c", "x".repeat(500)]) assert.equal(verifyTelehealthToken(g), null);
  });

  it("linkVersion is part of the signed claims (regenerate = new token, old version detectable)", () => {
    assert.notEqual(signTelehealthToken({ s: "s", p: "p", v: 1 }), signTelehealthToken({ s: "s", p: "p", v: 2 }));
    assert.match(patientJoinUrl({ id: "s", patientId: "p", linkVersion: 1 }), /\/v\/[\w-]+\.[\w-]+$/);
  });

  it("a different secret cannot verify", () => {
    const t = signTelehealthToken({ s: "s", p: "p", v: 1 });
    const old = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "another-secret-another-secret-another-secret";
    assert.equal(verifyTelehealthToken(t), null);
    process.env.JWT_SECRET = old;
  });
});

describe("ADR-039 telehealth-only windows + events", () => {
  it("parses and applies windows in clinic local time (Africa/Cairo)", () => {
    const w = parseTelehealthWindows({ mon: [{ start: "18:00", end: "21:00" }], tue: [{ start: "bad", end: "x" }] });
    assert.deepEqual(Object.keys(w ?? {}), ["mon"]);
    // Mon 2026-11-30 17:00Z = 19:00 Cairo (UTC+2): inside; 14:00Z = 16:00 Cairo: outside
    assert.equal(slotInsideWindows(w, "Africa/Cairo", new Date("2026-11-30T17:00:00Z"), new Date("2026-11-30T17:30:00Z")), true);
    assert.equal(slotInsideWindows(w, "Africa/Cairo", new Date("2026-11-30T14:00:00Z"), new Date("2026-11-30T14:30:00Z")), false);
    assert.equal(slotInsideWindows(null, "Africa/Cairo", T0, END), true);
  });

  it("missed payload says the patient is never charged; doctor-absent flags staff review", () => {
    const s = { id: "s", patientId: "p", linkVersion: 1, status: "MISSED", mode: "VIDEO" };
    const a = { id: "a", clinicId: "c", startsAt: T0, endsAt: END, externalReference: "kx1" };
    const d = telehealthMissedData(s, a, { missedAt: T0, absentParty: "CLINICIAN" });
    assert.equal(d.patientCharged, false);
    assert.equal(d.needsStaffReview, true);
    assert.equal(telehealthMissedData(s, a, { missedAt: T0, absentParty: "PATIENT" }).needsStaffReview, false);
    assert.equal(telehealthBlock(s, a).sessionId, "s");
  });

  it("outbox target: Kiorex bookings go to KIOREX, clinic-made ones stay INTERNAL", () => {
    assert.equal(outboxTargetFor("KIOREX_MARKETPLACE", "c1"), "KIOREX");
    assert.equal(outboxTargetFor("FRONT_DESK", null), "INTERNAL");
  });
});
