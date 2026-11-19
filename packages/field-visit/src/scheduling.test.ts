import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTravelMatrix } from "./zones";
import { DEFAULT_TRAVEL_BUFFERS, blockedInterval, canBook, filterBookableSlots, orderRoute, routeLegs, type PlannedVisit } from "./scheduling";

const MIN = 60_000;
const t = (h: number, m = 0) => Date.UTC(2026, 11, 1, h, m);
const visit = (sh: number, eh: number, extra: Partial<PlannedVisit> = {}): PlannedVisit => ({ startMs: t(sh), endMs: t(eh), ...extra });

describe("scheduling (HVCFG01/03, HVBK01)", () => {
  it("default buffers are 30/30 and block time around a booked visit", () => {
    assert.deepEqual(DEFAULT_TRAVEL_BUFFERS, { beforeMinutes: 30, afterMinutes: 30 });
    assert.deepEqual(blockedInterval(visit(10, 11)), { startMs: t(9, 30), endMs: t(11, 30) });
    assert.deepEqual(blockedInterval(visit(10, 11, { buffers: { beforeMinutes: 10, afterMinutes: 0 } })), { startMs: t(9, 50), endMs: t(11) });
  });

  it("a slot inside the travel buffer of a booked visit is blocked; one just outside is free", () => {
    const booked = [visit(10, 11)];
    assert.deepEqual(canBook(visit(11, 12), booked), { ok: false, reason: "OVERLAP" });
    assert.deepEqual(canBook({ startMs: t(8, 40), endMs: t(9, 10) }, booked), { ok: false, reason: "OVERLAP" });
    assert.deepEqual(canBook(visit(12, 13), booked), { ok: true });
    assert.deepEqual(canBook({ startMs: t(12), endMs: t(13) }, booked), { ok: true });
    assert.deepEqual(canBook({ startMs: t(11, 59), endMs: t(13) }, booked), { ok: false, reason: "OVERLAP" }, "11:59 - 30 min buffer reaches back into the booked 11:30 block");
    assert.deepEqual(canBook({ startMs: t(12), endMs: t(13) }, booked), { ok: true }, "12:00 - 30 = 11:30 meets the booked block exactly");
  });

  it("invalid intervals are rejected", () => {
    assert.deepEqual(canBook({ startMs: t(10), endMs: t(10) }, []), { ok: false, reason: "INVALID_INTERVAL" });
  });

  it("daily home-visit cap per day bucket (timezone-aware via dayKey)", () => {
    const booked = [visit(8, 9), visit(12, 13)];
    assert.deepEqual(canBook(visit(16, 17), booked, { dailyCap: 2 }), { ok: false, reason: "DAILY_CAP" });
    assert.deepEqual(canBook(visit(16, 17), booked, { dailyCap: 3 }), { ok: true });
    const nextDay = { startMs: t(8) + 24 * 60 * MIN, endMs: t(9) + 24 * 60 * MIN };
    assert.deepEqual(canBook(nextDay, booked, { dailyCap: 2 }), { ok: true });
    // Cairo is UTC+2: 22:30Z on the 1st is already the 2nd locally
    const cairoDay = (ms: number) => new Date(ms + 2 * 60 * MIN).toISOString().slice(0, 10);
    const late = { startMs: Date.UTC(2026, 11, 1, 22, 30), endMs: Date.UTC(2026, 11, 1, 23, 30) };
    assert.deepEqual(canBook(late, [visit(8, 9), visit(12, 13)], { dailyCap: 2, dayKey: cairoDay }), { ok: true });
    assert.deepEqual(canBook(late, [visit(8, 9), visit(12, 13)], { dailyCap: 2 }), { ok: false, reason: "DAILY_CAP" });
  });

  it("with a travel matrix, the gap must cover district-to-district travel", () => {
    const matrix = buildTravelMatrix({ maadi: { "nasr-city": 90 } });
    const a = visit(8, 9, { districtId: "maadi", buffers: { beforeMinutes: 0, afterMinutes: 0 } });
    const b = visit(10, 11, { districtId: "nasr-city", buffers: { beforeMinutes: 0, afterMinutes: 0 } });
    assert.deepEqual(canBook(b, [a], { matrix }), { ok: false, reason: "TRAVEL_INFEASIBLE" });
    assert.deepEqual(canBook({ ...b, startMs: t(10, 30), endMs: t(11, 30) }, [a], { matrix }), { ok: true });
    assert.deepEqual(canBook({ ...b, districtId: "dokki" }, [a], { matrix }), { ok: false, reason: "TRAVEL_INFEASIBLE" }, "unknown travel fails closed");
  });

  it("filterBookableSlots keeps only free slots", () => {
    const slots = [visit(9, 10), visit(10, 11), visit(13, 14)];
    assert.deepEqual(filterBookableSlots(slots, [visit(10, 11)]).map((s) => s.startMs), [t(13)]);
  });

  it("route is in time order (stable) and legs report feasibility", () => {
    const vs = [visit(13, 14, { id: "c", districtId: "maadi" }), visit(9, 10, { id: "a", districtId: "nasr-city" }), visit(9, 10, { id: "a2" }), visit(11, 12, { id: "b", districtId: "heliopolis" })];
    assert.deepEqual(orderRoute(vs).map((v) => v.id), ["a", "a2", "b", "c"]);
    const legs = routeLegs([vs[1]!, vs[3]!, vs[0]!], buildTravelMatrix({ "nasr-city": { heliopolis: 15, maadi: 200 }, heliopolis: { maadi: 30 } }));
    assert.deepEqual(legs.map((l) => [l.fromId, l.toId, l.travelMinutes, l.gapMinutes, l.feasible]), [["a", "b", 15, 60, true], ["b", "c", 30, 60, true]]);
    const bad = routeLegs([vs[1]!, vs[0]!], buildTravelMatrix({ "nasr-city": { maadi: 200 } }));
    assert.equal(bad[0]!.feasible, false);
  });
});
