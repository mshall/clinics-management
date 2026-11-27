import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeDeposit } from "./deposit-routing";

describe("deposit checkout routing (Kiorly Pay contract)", () => {
  it("Kiorex Pay first when a checkout host is configured and the circuit is closed", () => {
    const r = routeDeposit({ kiorexPayConfigured: true });
    assert.equal(r.destination, "KIOREX_PAY"); assert.deepEqual(r.decision.order, ["KIOREX_PAY", "CLINIC"]);
  });
  it("not configured: the clinic page, with the reason recorded", () => {
    const r = routeDeposit({ kiorexPayConfigured: false });
    assert.equal(r.destination, "CLINIC"); assert.deepEqual(r.decision.excluded, [{ psp: "KIOREX_PAY", reason: "DISABLED" }]);
  });
  it("failover: an open circuit routes to the clinic page", () => {
    const r = routeDeposit({ kiorexPayConfigured: true, kiorexPayAvailable: false });
    assert.equal(r.destination, "CLINIC"); assert.deepEqual(r.decision.excluded, [{ psp: "KIOREX_PAY", reason: "UNAVAILABLE" }]);
  });
  it("the organisation's explicit preference wins over the market order", () => {
    assert.equal(routeDeposit({ kiorexPayConfigured: true, orgPreference: "CLINIC" }).destination, "CLINIC");
    assert.equal(routeDeposit({ kiorexPayConfigured: true, orgPreference: "KIOREX_PAY" }).destination, "KIOREX_PAY");
  });
  it("a preference for an unavailable destination never routes to it", () => {
    assert.equal(routeDeposit({ kiorexPayConfigured: false, orgPreference: "KIOREX_PAY" }).destination, "CLINIC");
  });
  it("the clinic page is the floor: a deposit can always be routed", () => {
    const r = routeDeposit({ kiorexPayConfigured: false, kiorexPayAvailable: false });
    assert.equal(r.destination, "CLINIC");
  });
});
