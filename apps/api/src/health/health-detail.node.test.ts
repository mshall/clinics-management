import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HealthController } from "./health.controller";

/** KX-PT-L2: public liveness and readiness stay minimal; provider detail is internal-only. */
describe("health endpoints (KX-PT-L2)", () => {
  const ctl = new HealthController({ $queryRaw: async () => [{ "?column?": 1 }] } as never);
  const external = { headers: { "x-forwarded-for": "203.0.113.9" }, socket: { remoteAddress: "10.0.0.7" } };
  const internal = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  it("ready: external callers get only the status, internal callers the provider detail", async () => {
    const pub = await ctl.ready(external) as Record<string, unknown>;
    assert.deepEqual(Object.keys(pub).sort(), ["database", "status"]);
    assert.equal("providers" in pub || "leadSigning" in pub, false);
    const inn = await ctl.ready(internal) as Record<string, unknown>;
    assert.ok(Array.isArray(inn.providers) && inn.leadSigning);
  });
  it("providers: 403 INTERNAL_ONLY for external callers, the directory for internal ones", () => {
    assert.throws(() => ctl.providers(external), (e: unknown) => e instanceof ForbiddenException && (e.getResponse() as { code: string }).code === "INTERNAL_ONLY");
    assert.ok(Array.isArray(ctl.providers(internal).providers));
  });
  it("live stays public and minimal", () => { assert.equal(ctl.live().status, "ok"); });
});
