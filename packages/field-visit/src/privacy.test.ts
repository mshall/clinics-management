import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADDRESS_MASK_AFTER_MS, canViewAddress, maskedAddress } from "./privacy";

const H = 3_600_000;
const visit = (state: string, endedAtMs?: number) => ({ state: state as never, assignedClinicianId: "nurse-1", endedAtMs });

describe("address privacy (HVPRV01 / BR52)", () => {
  it("assigned clinician and org admins see the address once CONFIRMED", () => {
    for (const state of ["CONFIRMED", "ON_MY_WAY", "ARRIVED"]) {
      assert.equal(canViewAddress({ userId: "nurse-1" }, visit(state), 0), true, state);
      assert.equal(canViewAddress({ userId: "boss", isOrgAdmin: true }, visit(state), 0), true, state);
    }
  });

  it("an unassigned nurse (or any other user) never sees it", () => {
    for (const state of ["CONFIRMED", "ON_MY_WAY", "ARRIVED", "FINISHED"]) {
      assert.equal(canViewAddress({ userId: "nurse-2" }, visit(state, 0), 1), false, state);
    }
    assert.equal(canViewAddress({ userId: "x", isOrgAdmin: false }, { state: "ARRIVED", assignedClinicianId: undefined }, 0), false);
  });

  it("not before the visit is confirmed, and masked 24 h after it ends (for everyone, admins included)", () => {
    assert.equal(canViewAddress({ userId: "nurse-1" }, visit("REQUESTED"), 0), false);
    assert.equal(canViewAddress({ userId: "nurse-1" }, visit("CANCELLED"), 0), false);
    assert.equal(canViewAddress({ userId: "nurse-1" }, visit("FINISHED", 0), ADDRESS_MASK_AFTER_MS - 1), true);
    assert.equal(canViewAddress({ userId: "nurse-1" }, visit("FINISHED", 0), ADDRESS_MASK_AFTER_MS), false);
    assert.equal(canViewAddress({ userId: "boss", isOrgAdmin: true }, visit("ABORTED_UNSAFE", 0), 25 * H), false);
  });

  it("masked address keeps only the district", () => {
    assert.deepEqual(maskedAddress({ districtId: "maadi" }), { districtId: "maadi", masked: true });
  });
});
