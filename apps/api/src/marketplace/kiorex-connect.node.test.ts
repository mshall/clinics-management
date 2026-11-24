import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListingStatus, SubscriptionStatus, VerificationStatus } from "@prisma/client";
import { MARKETPLACE_BLOCKER, evaluateMarketplaceListingEligibility } from "./marketplace-listing-eligibility";
import { canRequestGoLive, computeConnectSteps, connectProgressPct, connectionGateFromSettings, type ConnectFacts } from "./kiorex-connect.logic";
import { deriveIntakeSigningKey, enrolmentIdOf, intakeHeaders, kiorexApiBase, newIntakeNonce, signConnectBody } from "./kiorex-connect.service";

const doctor = (o: Partial<ConnectFacts["doctors"][number]> = {}): ConnectFacts["doctors"][number] => ({ listingId: "l1", clinicianId: "u1", name: "Dr A", verification: "VERIFIED", hasAvailability: true, profilePercent: 90, profileMissing: [], status: "DRAFT", pausedReason: null, ...o });
const facts = (o: Partial<ConnectFacts> = {}): ConnectFacts => ({ connectStatus: "CONSENTED", subscription: "ACTIVE", entitlementOn: true, bookableTypes: 1, bookableTypesWithFee: 1, doctors: [doctor()], profileMin: 80, consentGiven: true, edition: "CLINIC", optionConfigured: false, ...o });
const st = (f: ConnectFacts, k: string) => computeConnectSteps(f).find((s) => s.key === k)!.status;

describe("Connect to Kiorex step checklist (ADR-040)", () => {
  it("a fully prepared standalone clinic can request to go live; the optional telehealth step never blocks", () => {
    const steps = computeConnectSteps(facts());
    assert.equal(steps.find((s) => s.key === "options")?.optional, true);
    assert.equal(st(facts(), "request"), "action_needed");
    assert.equal(canRequestGoLive(steps), true);
  });
  it("maps each real condition to done / action_needed / waiting_kiorex / blocked with a deep link", () => {
    assert.equal(st(facts({ subscription: "SUSPENDED" }), "subscription"), "blocked");
    assert.equal(st(facts({ subscription: "PAST_DUE" }), "subscription"), "action_needed");
    assert.equal(st(facts({ entitlementOn: false }), "entitlement"), "blocked");
    assert.equal(st(facts({ doctors: [doctor({ verification: "PENDING" })] }), "credentials"), "waiting_kiorex");
    assert.equal(st(facts({ doctors: [doctor({ verification: "UNVERIFIED" })] }), "credentials"), "action_needed");
    assert.equal(st(facts({ bookableTypesWithFee: 0 }), "appointment_types"), "action_needed");
    assert.equal(st(facts({ doctors: [doctor({ hasAvailability: false })] }), "availability"), "action_needed");
    const p = computeConnectSteps(facts({ doctors: [doctor({ profilePercent: 40, profileMissing: ["bioAr", "photo"] })] })).find((s) => s.key === "profile")!;
    assert.equal(p.status, "action_needed"); assert.deepEqual((p.detail as { missing: string[] }).missing, ["bioAr", "photo"]); assert.equal(p.link, "/kiorex");
    assert.equal(st(facts({ consentGiven: false }), "consent"), "action_needed");
  });
  it("request is blocked until every prerequisite is done, waits on Kiorex once sent and is done when approved and a listing is LIVE", () => {
    assert.equal(st(facts({ consentGiven: false }), "request"), "blocked");
    assert.equal(canRequestGoLive(computeConnectSteps(facts({ consentGiven: false }))), false);
    assert.equal(st(facts({ connectStatus: "REQUESTED" }), "request"), "waiting_kiorex");
    assert.equal(st(facts({ connectStatus: "CHANGES_REQUESTED" }), "request"), "action_needed");
    const live = facts({ connectStatus: "APPROVED", doctors: [doctor({ status: "LIVE" })] });
    assert.equal(st(live, "request"), "done"); assert.equal(st(live, "live"), "done"); assert.equal(connectProgressPct(computeConnectSteps(live)), 100);
  });
  it("nurse edition points the optional step at home visits", () => {
    assert.equal(computeConnectSteps(facts({ edition: "NURSE" })).find((s) => s.key === "options")?.link, "/nurse/services");
  });
  it("legacy organisations without a kiorexConnect document are never gated", () => {
    assert.equal(connectionGateFromSettings({}), undefined);
    assert.equal(connectionGateFromSettings(null), undefined);
    assert.deepEqual(connectionGateFromSettings({ kiorexConnect: { status: "STANDALONE" } }), { required: true, requested: false, paused: false });
    assert.deepEqual(connectionGateFromSettings({ kiorexConnect: { status: "APPROVED" } }), { required: false, requested: false, paused: false });
  });
});

describe("listing eligibility with the connection gate", () => {
  const green = { verificationStatus: VerificationStatus.VERIFIED, subscriptionStatus: SubscriptionStatus.ACTIVE, marketplaceBookableTypeCount: 1, hasAvailability: true, profileCompletenessPercent: 95 };
  it("standalone and not requested: DRAFT with the connection blocker last", () => {
    const e = evaluateMarketplaceListingEligibility({ ...green, connection: { required: true, requested: false, paused: false } });
    assert.equal(e.status, ListingStatus.DRAFT); assert.equal(e.pausedReason, MARKETPLACE_BLOCKER.CONNECTION);
  });
  it("another real blocker keeps its priority over the connection blocker", () => {
    const e = evaluateMarketplaceListingEligibility({ ...green, hasAvailability: false, connection: { required: true, requested: true, paused: false } });
    assert.equal(e.status, ListingStatus.DRAFT); assert.equal(e.pausedReason, MARKETPLACE_BLOCKER.AVAILABILITY);
  });
  it("requested and everything else green: PENDING_VERIFICATION; approved: LIVE; paused by Kiorex: PAUSED", () => {
    assert.equal(evaluateMarketplaceListingEligibility({ ...green, connection: { required: true, requested: true, paused: false } }).status, ListingStatus.PENDING_VERIFICATION);
    assert.equal(evaluateMarketplaceListingEligibility({ ...green, connection: { required: false, requested: false, paused: false } }).status, ListingStatus.LIVE);
    assert.equal(evaluateMarketplaceListingEligibility({ ...green, connection: { required: true, requested: false, paused: true } }).status, ListingStatus.PAUSED);
  });
  it("without a connection document nothing changes (legacy)", () => {
    assert.equal(evaluateMarketplaceListingEligibility(green).status, ListingStatus.LIVE);
  });
});

describe("signed request to Kiorex", () => {
  it("derives the API base from the outbox webhook URL and signs sha256=HMAC(ts.body) like the outbox", () => {
    assert.equal(kiorexApiBase({ KIOREX_OUTBOX_WEBHOOK_URL: "http://localhost:4000/api/v1/webhooks/kiorly" }), "http://localhost:4000/api/v1");
    assert.equal(kiorexApiBase({}), null);
    assert.match(signConnectBody("s", 1, "{}"), /^sha256=[0-9a-f]{64}$/);
  });
  it("intake auth (contracts 1.9.0): enrolment code signs the first request, the issued key later ones; same vectors as kiorex-contracts", () => {
    const code = "kxe_AAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    assert.equal(deriveIntakeSigningKey(code), "a0ce8b1dc66e4970ef3b844867fabe228c276e5bfffaccfe2ace5e67232adac3");
    const h = intakeHeaders(code, 1700000000, '{"a":1}', code);
    assert.equal(h["X-Kiorly-Signature"], "sha256=0f75288125b5933d50f18d797e51ff3160081300fb82c2b8753a22711baf3e14");
    assert.equal(h["X-Kiorex-Enrolment"], "kxe_AAAAAAAA");
    assert.equal(intakeHeaders("kxi_secret", 1, "{}")["X-Kiorex-Enrolment"], undefined);
    assert.equal(enrolmentIdOf("kxe_short"), undefined);
    assert.match(newIntakeNonce(), /^[A-Za-z0-9_-]{16,64}$/);
  });
  it("browser-walk regressions: a self-serve owner (PHYSICIAN + GROUP_ADMIN) can read the Passport default, and the partner contact e-mail is sent so Kiorex can notify", async () => {
    const { readFileSync } = await import("node:fs");
    const admin = readFileSync(new URL("../admin/admin.controller.ts", import.meta.url), "utf8");
    assert.doesNotMatch(admin, /user\.role !== "GROUP_ADMIN"\) throw new ForbiddenException\("Only group administrators can (read|change) the sign-in default"/);
    assert.match(admin, /hasRole\(user, UserRole\.GROUP_ADMIN\)\) throw new ForbiddenException\("Only group administrators can read the sign-in default"/);
    const svc = readFileSync(new URL("./kiorex-connect.service.ts", import.meta.url), "utf8");
    assert.match(svc, /send\(clinic, state, doc, enrolmentCode, user\.email\)/); assert.match(svc, /\.\.\.\(contactEmail &&/);
  });
});
