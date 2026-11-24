import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { cleanTalkToUs, frontDoorState, leadHeaders, leadSigningSecret, LeadInputError } from "./kiorex-front-door.logic";

describe("Kiorex tab front door (ADR-040)", () => {
  it("maps every connect status to one of the five states", () => {
    const f = (status: Parameters<typeof frontDoorState>[0]["status"], started = false, legacy = false) => frontDoorState({ legacy, status, started });
    assert.equal(f("STANDALONE"), "NOT_CONNECTED");
    assert.equal(f("STANDALONE", true), "IN_PROGRESS");
    assert.equal(f("CONSENTED"), "IN_PROGRESS");
    assert.equal(f("REQUESTED"), "WAITING");
    assert.equal(f("APPROVED"), "LIVE");
    for (const s of ["PAUSED", "CHANGES_REQUESTED", "REJECTED"] as const) assert.equal(f(s), "ATTENTION");
    assert.equal(f("STANDALONE", false, true), "LIVE", "legacy organisations are connected");
  });
  it("Talk to us needs consent, a name and a phone or e-mail; trims and limits everything", () => {
    const ok = { contactName: " Dr Hoda ", contactRole: "Owner", phone: "+20 100 000 0001", preferredTime: "MORNING", note: "After 10", consent: true };
    assert.deepEqual(cleanTalkToUs(ok), { contactName: "Dr Hoda", contactRole: "Owner", phone: "+20 100 000 0001", email: undefined, preferredTime: "MORNING", note: "After 10" });
    const code = (i: object) => { try { cleanTalkToUs(i); return "ok"; } catch (e) { return e instanceof LeadInputError ? e.code : "other"; } };
    assert.equal(code({ ...ok, consent: false }), "CONSENT_REQUIRED");
    assert.equal(code({ ...ok, phone: undefined }), "CONTACT_REQUIRED");
    assert.equal(code({ ...ok, phone: "abc" }), "INVALID_FIELD");
    assert.equal(code({ ...ok, email: "nope" }), "INVALID_FIELD");
    assert.equal(code({ ...ok, preferredTime: "NOON" }), "INVALID_FIELD");
    assert.equal(code({ ...ok, contactName: "" }), "INVALID_FIELD");
    assert.equal(code({ ...ok, note: "x".repeat(501) }), "INVALID_FIELD");
    assert.equal(code({ ...ok, phone: undefined, email: "a@b.co" }), "ok");
  });
  it("signs like the Kiorex lead endpoint (sha256 hex of the secret as the HMAC key over ts.body); a dev secret exists only outside production", () => {
    const h = leadHeaders("s3cret", 1700000000, "{\"a\":1}");
    const key = createHash("sha256").update("s3cret").digest("hex");
    assert.equal(h["X-Kiorly-Signature"], `sha256=${createHmac("sha256", key).update("1700000000.{\"a\":1}").digest("hex")}`);
    assert.equal(h["X-Kiorly-Timestamp"], "1700000000");
    assert.ok(leadSigningSecret({ NODE_ENV: "development" }));
    assert.equal(leadSigningSecret({ NODE_ENV: "production" }), null);
    assert.equal(leadSigningSecret({ NODE_ENV: "production", KIOREX_LEAD_SIGNING_SECRET: "x" }), "x");
  });
});
