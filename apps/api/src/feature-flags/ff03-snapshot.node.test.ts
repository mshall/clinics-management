import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import {
  diffSnapshots,
  signFlagWebhook,
  signSnapshot,
  verifySnapshot,
  canonicalJson,
  type FlagSnapshot,
} from "./kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";
import { KiorexFlagWebhookController } from "./kiorex-flag-webhook.controller";

const SECRET = "ff_dev_secret_change_me";

function makeSnap(version: number, over: Record<string, unknown> = {}): FlagSnapshot {
  const s = {
    product: "kiorly-clinic",
    version,
    generatedAt: "2026-11-19T10:00:00.000Z",
    flags: [
      {
        key: "clinic.ai_scribe",
        class: "AI",
        scopes: ["global", "market", "org"],
        dependsOn: [],
        launchLocked: false,
        gateSatisfied: false,
        values: version > 1 ? { orgs: { t1: "OFF" } } : {},
      },
    ],
    ...over,
  };
  return { ...s, signature: signSnapshot(SECRET, s as never) } as FlagSnapshot;
}

function fakePrisma() {
  const db = { snap: null as Record<string, unknown> | null, audits: [] as unknown[] };
  return {
    db,
    prisma: {
      kiorexFlagSnapshot: {
        findUnique: async () => db.snap,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          db.snap = create;
        },
        updateMany: async () => ({}),
      },
      kiorexFlagAuditEvent: { create: async ({ data }: { data: unknown }) => void db.audits.push(data) },
      tenant: { findMany: async () => [{ id: "t1" }] },
    },
  };
}

describe("FF03 snapshot contract helpers", () => {
  it("canonical JSON sorts keys and signature round-trips", () => {
    assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
    const s = makeSnap(1);
    assert.ok(verifySnapshot(SECRET, s));
    assert.ok(!verifySnapshot("other", s));
    assert.ok(!verifySnapshot(SECRET, { ...s, version: 2 }));
  });
});

describe("FF03 snapshot client (ETag, fail-static)", () => {
  const realFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  let calls: { url: string; headers: Record<string, string> }[] = [];
  beforeEach(() => {
    calls = [];
    process.env.KIOREX_CONTROL_PLANE_URL = "http://localhost:4000";
    delete process.env.KIOREX_FLAGS_SECRET;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...savedEnv };
  });

  it("fetches signed snapshot with HMAC headers, persists, then sends If-None-Match and handles 304", async () => {
    const { prisma, db } = fakePrisma();
    const audits: unknown[] = [];
    const svc = new KiorexFlagSnapshotService(prisma as never, { recordEvent: async (e: unknown) => void audits.push(e) } as never);
    const snap = makeSnap(2);
    let mode: "200" | "304" = "200";
    globalThis.fetch = (async (url: string, init: { headers: Record<string, string> }) => {
      calls.push({ url, headers: init.headers });
      return mode === "200"
        ? new Response(JSON.stringify(snap), { status: 200, headers: { etag: '"v2"' } })
        : new Response(null, { status: 304 });
    }) as never;

    assert.equal(await svc.refresh("poll"), true);
    assert.match(calls[0]!.url, /\/api\/v1\/control\/v1\/flags\/snapshot\?product=kiorly-clinic$/);
    assert.equal(calls[0]!.headers["X-Kiorex-Product-Key"], "ff_kiorly-clinic_dev");
    assert.ok(calls[0]!.headers["X-Kiorly-Signature"] && calls[0]!.headers["X-Kiorly-Nonce"]);
    assert.ok(!Object.values(calls[0]!.headers).includes(SECRET), "secret must never be sent");
    assert.equal(svc.getSnapshot()?.version, 2);
    assert.equal((db.snap as { version: number }).version, 2);
    assert.equal(audits.length, 1, "org-scope change audited on the tenant");
    assert.equal(db.audits.length, 1);

    mode = "304";
    assert.equal(await svc.refresh("poll"), true);
    assert.equal(calls[1]!.headers["If-None-Match"], '"v2"');
    assert.equal(db.audits.length, 1, "304 is not a change");
  });

  it("control plane down → last-known snapshot kept; bad signature rejected", async () => {
    const { prisma } = fakePrisma();
    const svc = new KiorexFlagSnapshotService(prisma as never, { recordEvent: async () => {} } as never);
    svc.setSnapshotForTests(makeSnap(1));
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as never;
    assert.equal(await svc.refresh("poll"), false);
    assert.equal(svc.getSnapshot()?.version, 1);
    assert.match(svc.meta().lastError ?? "", /ECONNREFUSED/);

    const tampered = { ...makeSnap(3), version: 9 };
    globalThis.fetch = (async () => new Response(JSON.stringify(tampered), { status: 200 })) as never;
    assert.equal(await svc.refresh("poll"), false);
    assert.equal(svc.getSnapshot()?.version, 1);
  });

  it("persisted snapshot is reloaded after restart (fail-static)", async () => {
    const { prisma, db } = fakePrisma();
    db.snap = { version: 4, etag: '"v4"', payload: makeSnap(4), fetchedAt: new Date(), lastError: null };
    const svc = new KiorexFlagSnapshotService(prisma as never, {} as never);
    await svc.loadPersisted();
    assert.equal(svc.getSnapshot()?.version, 4);
    assert.equal(svc.isManaged(), true);
  });

  it("FF06 diff lists org/global/gate changes", () => {
    const changes = diffSnapshots(makeSnap(1), makeSnap(2));
    assert.deepEqual(changes, [{ key: "clinic.ai_scribe", scope: "org", scopeId: "t1", from: "INHERIT", to: "OFF" }]);
  });

  it("FF06 stale alert fires after 10 minutes and is throttled", async () => {
    process.env.PLATFORM_ONCALL_SLACK_WEBHOOK_URL = "http://slack.test/hook";
    const posts: string[] = [];
    globalThis.fetch = (async (url: string) => {
      posts.push(url);
      return new Response("ok");
    }) as never;
    const { prisma } = fakePrisma();
    const svc = new KiorexFlagSnapshotService(prisma as never, {} as never);
    svc.setSnapshotForTests(makeSnap(1));
    const t0 = Date.now();
    assert.equal(svc.checkStale(t0 + 5 * 60_000), false);
    assert.equal(svc.checkStale(t0 + 11 * 60_000), true);
    assert.equal(svc.checkStale(t0 + 12 * 60_000), true);
    assert.equal(posts.filter((p) => p.includes("slack.test")).length, 1);
    assert.equal(svc.meta(t0 + 11 * 60_000).stale, true);
  });
});

describe("FF03 flag.changed webhook", () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function call(over: { sig?: string; ts?: string; body?: unknown } = {}) {
    let refreshed = 0;
    const ctl = new KiorexFlagWebhookController({ refresh: async () => (refreshed++, true) } as never);
    const body = over.body ?? { eventId: "e1", type: "flag.changed", data: { product: "kiorly-clinic" } };
    const raw = Buffer.from(JSON.stringify(body));
    const ts = over.ts ?? String(Math.floor(Date.now() / 1000));
    const req = {
      rawBody: raw,
      headers: {
        "x-kiorly-timestamp": ts,
        "x-kiorly-signature": over.sig ?? signFlagWebhook(SECRET, ts, raw),
        "x-kiorly-event-id": "e1",
      },
    };
    return { run: () => ctl.changed(req as never, body), refreshed: () => refreshed };
  }

  it("valid HMAC triggers immediate refresh; duplicate event id is a no-op", async () => {
    const c = call();
    assert.deepEqual(await c.run(), { accepted: true, refreshed: true });
    assert.deepEqual(await c.run(), { accepted: true, duplicate: true });
    assert.equal(c.refreshed(), 1);
  });
  it("rejects bad signature and stale timestamp", async () => {
    await assert.rejects(call({ sig: "sha256=" + "0".repeat(64) }).run(), UnauthorizedException);
    await assert.rejects(call({ ts: String(Math.floor(Date.now() / 1000) - 3600) }).run(), UnauthorizedException);
  });
  it("ignores events for other products", async () => {
    const c = call({ body: { type: "flag.changed", data: { product: "kiorex" } } });
    assert.equal(((await c.run()) as { ignored?: boolean }).ignored, true);
    assert.equal(c.refreshed(), 0);
  });
});
