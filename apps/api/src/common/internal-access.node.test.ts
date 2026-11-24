import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasInternalHealthAccess } from "./internal-access";

describe("KX-PT-L2 internal health access", () => {
  const direct = (ip: string, headers: Record<string, string> = {}) => ({ headers, socket: { remoteAddress: ip } });
  it("loopback and private addresses without a forwarding header are internal", () => {
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.5", "fd12::1"]) assert.equal(hasInternalHealthAccess(direct(ip), {}), true, ip);
  });
  it("public addresses are external", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "203.0.113.4", "2001:db8::1", undefined]) assert.equal(hasInternalHealthAccess(direct(ip as string), {}), false, String(ip));
  });
  it("anything that passed through a proxy (X-Forwarded-For / Forwarded) is external, even from a private hop", () => {
    assert.equal(hasInternalHealthAccess(direct("10.0.0.5", { "x-forwarded-for": "203.0.113.4" }), {}), false);
    assert.equal(hasInternalHealthAccess(direct("127.0.0.1", { forwarded: "for=203.0.113.4" }), {}), false);
  });
  it("the token opens the detail from anywhere; a wrong, empty or unset token never does", () => {
    const env = { HEALTH_DETAIL_TOKEN: "s3cret-token" };
    assert.equal(hasInternalHealthAccess(direct("203.0.113.4", { "x-health-token": "s3cret-token", "x-forwarded-for": "1.2.3.4" }), env), true);
    assert.equal(hasInternalHealthAccess(direct("203.0.113.4", { "x-health-token": "s3cret-tokeX" }), env), false);
    assert.equal(hasInternalHealthAccess(direct("203.0.113.4", { "x-health-token": "" }), env), false);
    assert.equal(hasInternalHealthAccess(direct("203.0.113.4", { "x-health-token": "anything" }), {}), false);
  });
});
