import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { Gender } from "@prisma/client";
import { decryptVisitAddress, encryptVisitAddress } from "./address-crypto";
import { checkFirstHomeVisit, checkGenderRestriction, homeFeeBreakdown, parseHomeHours, withinHomeHours } from "./home-visit-rules";
import { InternalJobKeyGuard } from "./internal-job-key.guard";
import { MockRouteMapsAdapter, UnwiredRealRouteMapsAdapter, mockTravelMinutes } from "./maps/mock-route-maps.adapter";
import { emitSafetyLog } from "./safety-log";
import { maskVisitAddress, parseVisitAddress, VisitAddressError } from "./visit-address";
import { AUDIT_REDACTED_BODY_KEYS, safeMetadata } from "../audit/audit.service";

describe("HVBK06 / HVSAF03 / HVFEE01 rules", () => {
  it("gender restriction is the clinician's own setting (BR60)", () => {
    assert.equal(checkGenderRestriction(null, Gender.M).ok, true);
    assert.equal(checkGenderRestriction(Gender.F, Gender.F).ok, true);
    const r = checkGenderRestriction(Gender.F, Gender.M);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, "HOME_VISIT_GENDER_RESTRICTED");
  });

  it("first home visit needs a Kiorex-verified phone or a deposit (BR51/BR54)", () => {
    assert.equal(checkFirstHomeVisit({ hasPriorAttendedHomeVisit: false, phoneVerifiedByKiorex: false, depositRequired: false }).ok, false);
    assert.equal(checkFirstHomeVisit({ hasPriorAttendedHomeVisit: false, phoneVerifiedByKiorex: true, depositRequired: false }).ok, true);
    assert.equal(checkFirstHomeVisit({ hasPriorAttendedHomeVisit: false, phoneVerifiedByKiorex: false, depositRequired: true }).ok, true);
    assert.equal(checkFirstHomeVisit({ hasPriorAttendedHomeVisit: true, phoneVerifiedByKiorex: false, depositRequired: false }).ok, true);
  });

  it("the home surcharge is a separate line and never part of the base fee (BR56)", () => {
    assert.deepEqual(homeFeeBreakdown(300, 50), { baseFee: 300, surcharge: 50, total: 350 });
    assert.deepEqual(homeFeeBreakdown(300, null), { baseFee: 300, surcharge: 0, total: 300 });
  });

  it("home hours: clinic-local ranges, null = no extra limit", () => {
    const hours = parseHomeHours({ mon: [["10:00", "14:00"]] });
    // 2026-11-23 is a Monday; Cairo is UTC+2 in winter
    assert.equal(withinHomeHours(hours, new Date("2026-11-23T09:00:00Z"), new Date("2026-11-23T09:45:00Z"), "Africa/Cairo"), true);
    assert.equal(withinHomeHours(hours, new Date("2026-11-23T13:00:00Z"), new Date("2026-11-23T13:45:00Z"), "Africa/Cairo"), false);
    assert.equal(withinHomeHours(null, new Date("2026-11-23T13:00:00Z"), new Date("2026-11-23T13:45:00Z"), "Africa/Cairo"), true);
    assert.throws(() => parseHomeHours({ funday: [] }));
    assert.throws(() => parseHomeHours({ mon: [["14:00", "10:00"]] }));
  });
});

describe("HVBK03 / HVPRV01 address handling", () => {
  it("parses the contract VisitAddress: district required; HOME needs line1; coordinates come in pairs", () => {
    const a = parseVisitAddress({ district: "Nasr City", line1: "12 Example St", building: "7", floor: "3", flat: "9", landmark: "Pharmacy", lat: 30.05, lng: 31.33 }, { requireLine1: true });
    assert.equal(a.district, "nasr-city");
    assert.throws(() => parseVisitAddress({ district: "nasr-city" }, { requireLine1: true }), (e: VisitAddressError) => e.code === "VISIT_ADDRESS_REQUIRED");
    assert.throws(() => parseVisitAddress(null, { requireLine1: false }), (e: VisitAddressError) => e.code === "VISIT_ADDRESS_REQUIRED");
    assert.throws(() => parseVisitAddress({ district: "x", lat: 30 }, { requireLine1: false }), (e: VisitAddressError) => e.code === "VISIT_ADDRESS_INVALID");
    assert.throws(() => parseVisitAddress({ district: "x", lat: 300, lng: 1 }, { requireLine1: false }), (e: VisitAddressError) => e.code === "VISIT_ADDRESS_INVALID");
  });

  it("encrypts at rest (AES-256-GCM), binds the tenant, and never leaks the plaintext into the ciphertext", () => {
    const addr = { district: "maadi", line1: "9 Road Nine", flat: "4" };
    const ct = encryptVisitAddress(addr, "tenant-a");
    assert.ok(!ct.includes("Road Nine") && !Buffer.from(ct, "base64").toString("utf8").includes("Road Nine"));
    assert.deepEqual(decryptVisitAddress(ct, "tenant-a"), addr);
    assert.equal(decryptVisitAddress(ct, "tenant-b"), null, "a ciphertext copied to another tenant must not decrypt");
    assert.notEqual(encryptVisitAddress(addr, "tenant-a"), ct, "fresh IV per encryption");
    assert.equal(decryptVisitAddress("garbage", "tenant-a"), null);
  });

  it("masked view is district only", () => {
    assert.deepEqual(maskVisitAddress({ district: "maadi" }), { district: "maadi", masked: true });
  });

  it("audit metadata redacts addresses, coordinates and live location from request bodies (PHI-leak)", () => {
    const meta = safeMetadata("POST", "home-visits/x/sos", { visitAddress: { line1: "secret street" }, address: "x", lat: 30.1, lng: 31.2, liveLocation: { lat: 1, lng: 2 }, reason: "ok" });
    const text = JSON.stringify(meta);
    assert.ok(!text.includes("secret street") && !text.includes("30.1") && !text.includes("liveLocation"));
    assert.deepEqual((meta as { body: unknown }).body, { reason: "ok" });
    assert.ok(AUDIT_REDACTED_BODY_KEYS.includes("visitAddress"));
  });
});

describe("safety alert log events (infra/tofu safety-alerts log contract)", () => {
  it("emits exactly the documented single-line JSON events, PHI-free", () => {
    const lines: string[] = [];
    emitSafetyLog({ event: "safety_alert.raised", alertId: "a1", kind: "SOS" }, (l) => lines.push(l));
    emitSafetyLog({ event: "safety_alert.delivered", alertId: "a1", channel: "SMS", deliveryLatencyMs: 1234.6 }, (l) => lines.push(l));
    emitSafetyLog({ event: "safety_alert.delivery_failed", alertId: "a1", channel: "SMS" }, (l) => lines.push(l));
    assert.deepEqual(lines.map((l) => JSON.parse(l)), [
      { event: "safety_alert.raised", alertId: "a1", kind: "SOS" },
      { event: "safety_alert.delivered", alertId: "a1", channel: "SMS", deliveryLatencyMs: 1235 },
      { event: "safety_alert.delivery_failed", alertId: "a1", channel: "SMS" },
    ]);
    for (const l of lines) assert.ok(!l.includes("\n"));
    // a hostile extra field can never be written: the event is rebuilt from a whitelist
    const leaked: string[] = [];
    emitSafetyLog({ event: "safety_alert.delivered", alertId: "a1", channel: "SMS", deliveryLatencyMs: 5, address: "secret", phone: "+2010" } as never, (l) => leaked.push(l));
    assert.ok(!leaked[0]!.includes("secret") && !leaked[0]!.includes("+2010"));
  });
});

describe("mock route/maps adapter (MODE=mock default)", () => {
  it("is deterministic and symmetric; navigation links are mock-hosted", () => {
    assert.equal(mockTravelMinutes("a", "b"), mockTravelMinutes("b", "a"));
    assert.ok(mockTravelMinutes("a", "b") >= 10 && mockTravelMinutes("a", "b") <= 45);
    const m = new MockRouteMapsAdapter();
    assert.equal(m.mode, "mock");
    assert.equal(m.legs([{ id: "1", districtId: "a" }, { id: "2", districtId: "b" }, { id: "3", districtId: "c" }]).length, 2);
    assert.ok(m.navigationUrl({ lat: 30, lng: 31 }).startsWith("https://maps.mock.kiorly.test/"));
  });
  it("the real adapter fails closed until wired", () => {
    assert.throws(() => new UnwiredRealRouteMapsAdapter().legs(), /not wired/);
  });
});

describe("POST /internal/jobs/* key guard", () => {
  const saved = process.env.INTERNAL_JOB_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.INTERNAL_JOB_KEY;
    else process.env.INTERNAL_JOB_KEY = saved;
  });
  const ctx = (key?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: key === undefined ? {} : { "x-internal-job-key": key } }) }) }) as never;
  it("closed when unconfigured, rejects a wrong or missing key, accepts the right one", () => {
    const g = new InternalJobKeyGuard();
    delete process.env.INTERNAL_JOB_KEY;
    assert.throws(() => g.canActivate(ctx("x")), /not configured/);
    process.env.INTERNAL_JOB_KEY = "s3cret-job-key";
    assert.throws(() => g.canActivate(ctx()), /Invalid job key/);
    assert.throws(() => g.canActivate(ctx("nope")), /Invalid job key/);
    assert.equal(g.canActivate(ctx("s3cret-job-key")), true);
  });
});
