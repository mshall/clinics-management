import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coarsen, retainGeostamp, GEOSTAMP_RETENTION_MS } from "./geostamp";
import { applyEvent, isCheckedIn, isCompleted, newVisit, noShowAllowed, type FieldVisit, type VisitEvent } from "./lifecycle";

const T0 = Date.UTC(2026, 11, 1, 9);
const fresh = (): FieldVisit => newVisit({ id: "v1", plannedStartMs: T0 + 3_600_000, plannedEndMs: T0 + 7_200_000, assignedClinicianId: "c1", nowMs: T0 });
const GEO = { lat: 30.04442, lng: 31.23571, districtId: "maadi" };

function run(v: FieldVisit, ...events: VisitEvent[]): FieldVisit {
  let cur = v;
  let t = T0;
  for (const e of events) {
    t += 60_000;
    const r = applyEvent(cur, e, t);
    assert.ok(r.ok, `${e.type} failed: ${r.ok ? "" : r.code}`);
    cur = r.visit;
  }
  return cur;
}

describe("visit lifecycle (KX-05 §08 flow)", () => {
  it("happy path: confirmed -> on my way -> arrived (check-in) -> finished (complete)", () => {
    const v = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: GEO }, { type: "FINISH" });
    assert.equal(v.state, "FINISHED");
    assert.deepEqual(v.history.map((h) => h.state), ["REQUESTED", "CONFIRMED", "ON_MY_WAY", "ARRIVED", "FINISHED"]);
    assert.equal(isCheckedIn(v), true);
    assert.equal(isCompleted(v), true);
    assert.ok(v.endedAtMs);
  });

  it("CONFIRM needs the address confirmed; ARRIVE needs a geostamp; unsafe abort needs a reason", () => {
    assert.deepEqual(applyEvent(fresh(), { type: "CONFIRM", addressConfirmed: false }, T0), { ok: false, code: "ADDRESS_NOT_CONFIRMED" });
    const onWay = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" });
    assert.deepEqual(applyEvent(onWay, { type: "ARRIVE" } as never, T0), { ok: false, code: "GEOSTAMP_REQUIRED" });
    assert.deepEqual(applyEvent(onWay, { type: "ABORT_UNSAFE", reason: "  " }, T0), { ok: false, code: "REASON_REQUIRED" });
  });

  it("illegal transitions are rejected (cannot skip, cannot leave a terminal state)", () => {
    assert.deepEqual(applyEvent(fresh(), { type: "DEPART" }, T0), { ok: false, code: "ILLEGAL_TRANSITION" });
    assert.deepEqual(applyEvent(fresh(), { type: "FINISH" }, T0), { ok: false, code: "ILLEGAL_TRANSITION" });
    const done = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: GEO }, { type: "FINISH" });
    for (const e of [{ type: "DEPART" }, { type: "CANCEL" }, { type: "MARK_NO_SHOW" }, { type: "ABORT_UNSAFE", reason: "x" }] as VisitEvent[]) {
      assert.equal(applyEvent(done, e, T0).ok, false, e.type);
    }
  });

  it("HVSAF04 / BR61: leaving unsafe ends the visit with a reason and is never a no-show", () => {
    const arrived = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" }, { type: "ARRIVE", geostamp: GEO });
    const r = applyEvent(arrived, { type: "ABORT_UNSAFE", reason: "Aggressive dog at the door", geostamp: GEO }, T0 + 9e6);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.visit.state, "ABORTED_UNSAFE");
    assert.equal(r.visit.abortReason, "Aggressive dog at the door");
    assert.equal(noShowAllowed(r.visit), false);
    assert.deepEqual(applyEvent(r.visit, { type: "MARK_NO_SHOW" }, T0), { ok: false, code: "NO_SHOW_NOT_ALLOWED" });
    // also from "on my way"
    const onWay = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART" });
    assert.equal(applyEvent(onWay, { type: "ABORT_UNSAFE", reason: "Unsafe street" }, T0).ok, true);
  });

  it("no-show only before arrival; cancel only before departure", () => {
    const confirmed = run(fresh(), { type: "CONFIRM", addressConfirmed: true });
    assert.equal(noShowAllowed(confirmed), true);
    assert.equal(applyEvent(confirmed, { type: "CANCEL" }, T0).ok, true);
    const arrived = run(confirmed, { type: "DEPART" }, { type: "ARRIVE", geostamp: GEO });
    assert.equal(noShowAllowed(arrived), false);
    assert.equal(applyEvent(arrived, { type: "CANCEL" }, T0).ok, false);
    assert.equal(applyEvent(arrived, { type: "MARK_NO_SHOW" }, T0).ok, false);
  });

  it("geostamps entering the lifecycle are always coarse (precise coordinates are never stored)", () => {
    const v = run(fresh(), { type: "CONFIRM", addressConfirmed: true }, { type: "DEPART", geostamp: GEO }, { type: "ARRIVE", geostamp: GEO });
    const stamps = v.history.filter((h) => h.geostamp).map((h) => h.geostamp!);
    assert.equal(stamps.length, 2);
    for (const g of stamps) assert.deepEqual([g.lat, g.lng], [30.04, 31.24]);
    assert.equal(JSON.stringify(v).includes("30.04442"), false);
  });

  it("the input visit is never mutated", () => {
    const v = fresh();
    const snapshot = JSON.stringify(v);
    applyEvent(v, { type: "CONFIRM", addressConfirmed: true }, T0);
    assert.equal(JSON.stringify(v), snapshot);
  });
});

describe("geostamp retention", () => {
  it("coarsen rounds to ~1 km and rejects nonsense", () => {
    assert.deepEqual(coarsen(30.04442, 31.23571), { lat: 30.04, lng: 31.24 });
    assert.throws(() => coarsen(91, 0), /INVALID/);
    assert.throws(() => coarsen(Number.NaN, 0), /INVALID/);
  });
  it("12 months then district only", () => {
    const g = coarsen(30.04, 31.23, "maadi");
    assert.deepEqual(retainGeostamp(g, 0, GEOSTAMP_RETENTION_MS - 1), g);
    assert.deepEqual(retainGeostamp(g, 0, GEOSTAMP_RETENTION_MS), { districtId: "maadi" });
    assert.deepEqual(retainGeostamp(coarsen(1, 1), 0, GEOSTAMP_RETENTION_MS), {});
  });
});
