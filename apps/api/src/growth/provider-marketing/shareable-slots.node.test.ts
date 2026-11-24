import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSlotParam, trackedSlotUrl } from "../provider-links/link-urls";
import { pickNextSlots, slotLabel } from "./shareable-slots.service";

const now = new Date("2026-11-24T08:00:00Z");
const s = (iso: string) => ({ startsAt: iso, endsAt: iso });

describe("GRW-P2-C shareable slots (pure parts)", () => {
  it("returns at most 5, earliest first, future only, de-duplicated", () => {
    const slots = ["2026-11-24T12:00:00Z", "2026-11-24T07:00:00Z", "2026-11-24T09:00:00Z", "2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", "2026-11-25T09:00:00Z"].map(s);
    const out = pickNextSlots(slots, now);
    assert.equal(out.length, 5);
    assert.deepEqual(out.map((x) => x.startsAt), ["2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z", "2026-11-24T11:00:00Z", "2026-11-24T12:00:00Z", "2026-11-25T09:00:00Z"]);
  });
  it("a past slot is never offered", () => assert.deepEqual(pickNextSlots([s("2026-11-24T07:59:00Z")], now), []));
  it("labels use the CLINIC time zone, not the server's (Cairo vs Riyadh vs UTC)", () => {
    const iso = "2026-11-24T08:00:00Z";
    assert.match(slotLabel(iso, "Africa/Cairo", "en"), /10:00/);
    assert.match(slotLabel(iso, "Asia/Riyadh", "en"), /11:00/);
    assert.match(slotLabel(iso, "UTC", "en"), /08:00/);
    assert.ok(/[؀-ۿ]/.test(slotLabel(iso, "Africa/Cairo", "ar")));
  });
  it("Cairo summer time (UTC+3 after the last Friday of April) is honoured", () => assert.match(slotLabel("2027-07-01T08:00:00Z", "Africa/Cairo", "en"), /11:00/));
  it("the slot link carries the provider link code and the slot start; it never contains a patient or fee field", () => {
    const url = trackedSlotUrl("nile-clinic", "ABCD2345", "2026-11-25T09:00:00.000Z");
    const u = new URL(url);
    assert.equal(u.searchParams.get("s"), "ABCD2345");
    assert.equal(u.searchParams.get("slot"), "2026-11-25T09:00:00.000Z");
    assert.ok(![...u.searchParams.keys()].some((k) => /patient|phone|fee|price/i.test(k)));
  });
  it("normalizeSlotParam keeps only a real future instant within 90 days", () => {
    assert.equal(normalizeSlotParam("2026-11-25T09:00:00Z", now), "2026-11-25T09:00:00.000Z");
    assert.equal(normalizeSlotParam("2026-11-24T07:00:00Z", now), null);
    assert.equal(normalizeSlotParam("2027-06-01T07:00:00Z", now), null);
    assert.equal(normalizeSlotParam("not a date", now), null);
    assert.equal(normalizeSlotParam("<script>", now), null);
    assert.equal(normalizeSlotParam(undefined, now), null);
  });
});
