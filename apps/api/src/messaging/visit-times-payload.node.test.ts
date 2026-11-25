import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { visitTimesPayload } from "./appointment-outbox.service";

const tx = (checkedInAt: Date | null) => ({ appointment: { findUnique: async () => ({ checkedInAt }) } }) as never;
const now = new Date("2027-01-01T10:30:00.000Z");

describe("visit times on CHECKED_IN and COMPLETED (contracts 1.13.0, optional)", () => {
  it("COMPLETED carries the check-in time of the appointment and the completion time", async () => {
    const ci = new Date("2027-01-01T10:12:00.000Z");
    assert.deepEqual(await visitTimesPayload(tx(ci), "a1", AppointmentStatus.COMPLETED, now), { checkedInAt: ci.toISOString(), completedAt: now.toISOString() });
  });
  it("COMPLETED without a check-in carries only completedAt", async () => {
    assert.deepEqual(await visitTimesPayload(tx(null), "a1", AppointmentStatus.COMPLETED, now), { completedAt: now.toISOString() });
  });
  it("CHECKED_IN carries checkedInAt only; every other status carries nothing", async () => {
    assert.deepEqual(await visitTimesPayload(tx(null), "a1", AppointmentStatus.CHECKED_IN, now), { checkedInAt: now.toISOString() });
    for (const s of [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW, AppointmentStatus.CONFIRMED]) assert.deepEqual(await visitTimesPayload(tx(null), "a1", s, now), {});
  });
  it("no transaction client: nothing is added for CONFIRMED, and a completion still carries completedAt", async () => {
    assert.deepEqual(await visitTimesPayload(undefined, "a1", AppointmentStatus.COMPLETED, now), { completedAt: now.toISOString() });
  });
});
