import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttributionEvidenceService, signEvidenceRequest } from "./attribution-evidence.service";

/**
 * GrowthEvidence mock/real wiring against a LIVE local Kiorex (GRW-P1-D2 follow-up). Opt-in: `GROWTH_EVIDENCE_LIVE=1` with the dev stack up (Kiorex API :4000,
 * Postgres :5433). It reads real bookings and decisions from the Kiorex database, then asks the Kiorex API for the evidence exactly as the Clinic does in
 * `GROWTH_EVIDENCE_MODE=real` (partner request HMAC + X-Kiorly-Org-Ref), and checks the verdicts, the isolation between organisations and the failure modes.
 */
const LIVE = process.env.GROWTH_EVIDENCE_LIVE === "1";
const BASE = process.env.KIOREX_API_BASE_URL ?? "http://localhost:4000/api/v1";
const SECRET = process.env.KIOREX_OUTBOX_WEBHOOK_SECRET ?? "kx_dev_webhook_secret";
const DB = process.env.KIOREX_LIVE_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/kiorex_platform?schema=public";

const tx = (bookingId: string) => ({ appointment: { findFirst: async () => ({ id: "apt_live", externalReference: bookingId, attributionJson: null }) } }) as never;
async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

describe("GrowthEvidence real mode against a live Kiorex", { skip: LIVE ? false : "set GROWTH_EVIDENCE_LIVE=1 with the local stack running" }, () => {
  it("signs like the contracts scheme (shape of the headers)", () => {
    const h = signEvidenceRequest({ secret: "s", clientKey: "k", method: "get", path: "/api/v1/growth/v1/evidence/x", orgRef: "org_1", now: 1_700_000_000_000, nonce: "n1" });
    assert.deepEqual(Object.keys(h).sort(), ["x-kiorly-client-key", "x-kiorly-nonce", "x-kiorly-org-ref", "x-kiorly-signature", "x-kiorly-timestamp"]);
    assert.equal(h["x-kiorly-timestamp"], "1700000000000");
  });

  it("PROVIDER_LED booking => providerLed true from KIOREX; MARKETPLACE booking => false; another organisation => 404; wrong secret => 401; unreachable => UNAVAILABLE", async () => {
    const { Client } = await import("pg");
    const db = new Client({ connectionString: DB.replace("?schema=public", "") });
    await db.connect();
    let led: { bookingId: string; tenantId: string } | undefined;
    let mkt: { bookingId: string; tenantId: string } | undefined;
    try {
      const rows = (await db.query(`select d."bookingId", b."tenantId", d.origin from "GrowthAttributionDecision" d join "BookingIntent" b on b.id = d."bookingId" where d."supersedesId" is null and b."tenantId" is not null order by d."createdAt" desc limit 400`)).rows as Array<{ bookingId: string; tenantId: string; origin: string }>;
      led = rows.find((r) => r.origin === "PROVIDER_LED");
      mkt = rows.find((r) => r.origin === "MARKETPLACE");
    } finally { await db.end(); }
    assert.ok(led && mkt, "the live Kiorex database needs one PROVIDER_LED and one MARKETPLACE decision (run e2e 25 first)");
    const svc = new AttributionEvidenceService();
    const real = { GROWTH_EVIDENCE_MODE: "real", KIOREX_API_BASE_URL: BASE, KIOREX_OUTBOX_WEBHOOK_SECRET: SECRET };

    const a = await withEnv(real, () => svc.verdict(tx(led!.bookingId), led!.tenantId, "apt_live"));
    assert.equal(a.source, "KIOREX");
    assert.equal(a.providerLed, true);
    assert.ok(a.decisionRef);

    const b = await withEnv(real, () => svc.verdict(tx(mkt!.bookingId), mkt!.tenantId, "apt_live"));
    assert.equal(b.source, "KIOREX");
    assert.equal(b.providerLed, false, "a marketplace decision is never turned into a provider-led one by evidence");

    // organisation isolation: another organisation's id cannot read this booking's evidence
    const other = await withEnv(real, () => svc.verdict(tx(led!.bookingId), "org_not_the_owner", "apt_live"));
    assert.deepEqual([other.source, other.providerLed, other.reason], ["UNAVAILABLE", false, "KIOREX_404"]);

    // a wrong secret cannot authenticate
    const bad = await withEnv({ ...real, KIOREX_OUTBOX_WEBHOOK_SECRET: "not-the-secret" }, () => svc.verdict(tx(led!.bookingId), led!.tenantId, "apt_live"));
    assert.deepEqual([bad.source, bad.providerLed, bad.reason], ["UNAVAILABLE", false, "KIOREX_401"]);

    // unreachable Kiorex never approves anything
    const down = await withEnv({ ...real, KIOREX_API_BASE_URL: "http://127.0.0.1:1/api/v1" }, () => svc.verdict(tx(led!.bookingId), led!.tenantId, "apt_live"));
    assert.deepEqual([down.source, down.providerLed], ["UNAVAILABLE", false]);

    // mock mode (the default) never calls Kiorex: with no link on the booking the verdict is local and negative
    const mock = await withEnv({ GROWTH_EVIDENCE_MODE: undefined, KIOREX_API_BASE_URL: "http://127.0.0.1:1/api/v1" }, () => svc.verdict(tx(led!.bookingId), led!.tenantId, "apt_live"));
    assert.deepEqual([mock.source, mock.providerLed, mock.reason], ["MOCK_LOCAL", false, "NO_PROVIDER_LINK_ON_BOOKING"]);
  });
});
