import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { mapsConfig, providerEnvProblems, providerStatus, type MapsConfig } from "../../common/provider-env";
import { providerMode } from "../../common/provider-mode";
import { amazonRoutesSigner, parseRouteMatrix, routeMatrixBody } from "../../common/vendors/maps-amazon-routes";
import { AmazonRouteMapsAdapter, loadCentroids } from "./amazon-route-maps.adapter";
import { MockRouteMapsAdapter } from "./mock-route-maps.adapter";

let server: Server; let base = "";
let seen: Array<{ url?: string; headers: Record<string, unknown>; body: any }> = [];
let script: Array<{ status: number; body: unknown }> = [];
/** Default responder: minutes = 10 * (|i - j|) + 5 seconds-based Duration, so the diagonal / pairs are recognisable. */
before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
      seen.push({ url: req.url, headers: req.headers, body });
      const next = script.shift();
      const out = next ?? { status: 200, body: { RouteMatrix: body.Origins.map((_: unknown, i: number) => body.Destinations.map((__: unknown, j: number) => ({ Distance: 1000, Duration: (Math.abs(i - j) * 10 + 5) * 60 - 30 }))) } };
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());
beforeEach(() => { seen = []; script = []; });

const CENTROIDS = JSON.stringify({ nasr: [30.05, 31.33], maadi: [29.96, 31.25], giza: [30.01, 31.21] });
const cfg = (over: Partial<MapsConfig> = {}): MapsConfig => ({ apiUrl: base, apiKey: "maps-KEY-123", webhookSecret: "", timeoutMs: 2000, maxRetries: 1, backoffMs: 1, accessKeyId: "", secretAccessKey: "", travelMode: "Car", country: "EGY", centroidsJson: CENTROIDS, centroidsFile: "", ...over });
const fast = { sleep: async () => undefined };

describe("AmazonRouteMapsAdapter (MAPS_MODE=real, faked HTTP)", () => {
  it("travelMatrix prefetches the pairs in ONE route-matrix call (lng,lat order, API key in the query) and serves a synchronous lookup", async () => {
    const a = new AmazonRouteMapsAdapter(cfg(), fast);
    const m = await a.travelMatrix(["nasr", "maadi", "nasr", "", "unknown-district"]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, "/v2/route-matrix?key=maps-KEY-123");
    assert.deepEqual(seen[0]!.body.Origins, [{ Position: [31.33, 30.05] }, { Position: [31.25, 29.96] }]);
    assert.deepEqual(seen[0]!.body.RoutingBoundary, { Unbounded: true });
    assert.equal(seen[0]!.body.TravelMode, "Car");
    assert.equal(m.minutes("nasr", "maadi"), 15); // 14.5 min rounded up
    assert.equal(m.minutes("nasr", "nasr"), 0);
    assert.equal(m.minutes("nasr", "giza"), null); // not requested
    assert.equal(m.minutes("nasr", "unknown-district"), null);
  });

  it("caches pairs (24 h): a second request for the same districts makes no HTTP call, a new district triggers one", async () => {
    let t = 1_000_000;
    const a = new AmazonRouteMapsAdapter(cfg(), fast, () => t);
    await a.travelMatrix(["nasr", "maadi"]); await a.travelMatrix(["maadi", "nasr"]);
    assert.equal(seen.length, 1);
    await a.travelMatrix(["nasr", "maadi", "giza"]);
    assert.equal(seen.length, 2);
    t += 25 * 3600_000; await a.travelMatrix(["nasr", "maadi"]);
    assert.equal(seen.length, 3);
  });

  it("legs asks for consecutive stops only (diagonal), prefers GPS over the district centroid and omits legs it cannot place", async () => {
    const a = new AmazonRouteMapsAdapter(cfg(), fast);
    const legs = await a.legs([{ id: "v1", districtId: "nasr" }, { id: "v2", districtId: "maadi", lat: 29.9, lng: 31.3 }, { id: "v3", districtId: "nowhere" }, { id: "v4", districtId: "giza" }]);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0]!.body.Origins.map((o: any) => o.Position), [[31.33, 30.05]]); // only v1 -> v2 can be placed
    assert.deepEqual(seen[0]!.body.Destinations.map((o: any) => o.Position), [[31.3, 29.9]]);
    assert.deepEqual(legs, [{ fromId: "v1", toId: "v2", travelMinutes: 5 }]);
    assert.deepEqual(await new AmazonRouteMapsAdapter(cfg(), fast).legs([{ id: "only", districtId: "nasr" }]), []);
  });

  it("fails closed with 503 on provider errors and on malformed bodies, without leaking the key", async () => {
    script = [{ status: 403, body: { message: "bad key maps-KEY-123" } }];
    await assert.rejects(new AmazonRouteMapsAdapter(cfg(), fast).travelMatrix(["nasr", "maadi"]), (e: unknown) => e instanceof ServiceUnavailableException && !JSON.stringify((e as ServiceUnavailableException).getResponse()).includes("maps-KEY-123"));
    script = [{ status: 200, body: { nope: true } }];
    await assert.rejects(new AmazonRouteMapsAdapter(cfg(), fast).legs([{ id: "a", districtId: "nasr" }, { id: "b", districtId: "maadi" }]), ServiceUnavailableException);
  });

  it("retries 5xx and then succeeds", async () => {
    script = [{ status: 500, body: {} }];
    const m = await new AmazonRouteMapsAdapter(cfg(), fast).travelMatrix(["nasr", "maadi"]);
    assert.equal(seen.length, 2); assert.equal(m.minutes("maadi", "nasr"), 15);
  });

  it("navigation links are provider-free universal links", () => {
    const a = new AmazonRouteMapsAdapter(cfg(), fast);
    assert.equal(a.navigationUrl({ lat: 30.05, lng: 31.33 }), "https://www.google.com/maps/dir/?api=1&destination=30.05,31.33");
    assert.match(a.navigationUrl({ query: "12 Tahrir St" }), /query=12%20Tahrir%20St$/);
  });
});

describe("route matrix wire format and config", () => {
  it("parses durations (seconds -> minutes, up) and per-cell errors", () => {
    assert.deepEqual(parseRouteMatrix({ RouteMatrix: [[{ Duration: 61 }, { Error: "NoRoute" }]] }), [[2, null]]);
    assert.equal(parseRouteMatrix({}), null);
    assert.deepEqual(routeMatrixBody([[1, 2]], [[3, 4]], "Pedestrian").TravelMode, "Pedestrian");
  });
  it("SigV4 (geo-routes) is used when only IAM keys are configured", () => {
    const sign = amazonRoutesSigner("https://routes.geo.eu-central-1.amazonaws.com", "AKIAEXAMPLE", "secret")!;
    const h = sign({ method: "POST", url: "https://routes.geo.eu-central-1.amazonaws.com/v2/route-matrix", body: "{}" });
    assert.match(h.authorization!, /Credential=AKIAEXAMPLE\/\d{8}\/eu-central-1\/geo-routes\/aws4_request/);
    assert.equal(amazonRoutesSigner("http://127.0.0.1:1", "a", "b"), undefined);
  });
  it("centroids load from JSON (lat,lng stored, lng,lat sent)", () => { assert.deepEqual(loadCentroids({ centroidsJson: CENTROIDS, centroidsFile: "" }).get("nasr"), [31.33, 30.05]); });
  it("mock stays the default; MAPS_MODE=real needs URL, credentials and centroids (names only, never values)", () => {
    const saved = { ...process.env };
    try {
      delete process.env.MAPS_MODE; delete process.env.KIORLY_PROVIDER_MODE_MAPS; delete process.env.KIORLY_PROVIDER_MODE;
      assert.equal(providerMode("maps"), "mock");
      assert.deepEqual(providerEnvProblems({ ...process.env } as NodeJS.ProcessEnv).filter((p) => p.startsWith("MAPS")), []);
      process.env.MAPS_MODE = "real"; assert.equal(providerMode("maps"), "real");
      const bad = providerEnvProblems({ ...process.env, MAPS_MODE: "real" } as NodeJS.ProcessEnv).filter((p) => p.startsWith("MAPS"));
      assert.equal(bad.length, 3);
      const ok = { ...process.env, MAPS_MODE: "real", MAPS_API_URL: "https://routes.geo.eu-central-1.amazonaws.com", MAPS_API_KEY: "k", MAPS_DISTRICT_CENTROIDS_JSON: CENTROIDS } as NodeJS.ProcessEnv;
      assert.deepEqual(providerEnvProblems(ok).filter((p) => p.startsWith("MAPS")), []);
      assert.equal(mapsConfig(ok).travelMode, "Car");
      assert.equal(providerStatus(ok).find((r) => r.provider === "maps")!.vendor, "amazon-location");
      assert.ok(!JSON.stringify(bad).includes("routes.geo"));
    } finally { process.env = saved; }
  });
  it("the mock adapter still answers synchronously (async-capable port, no behaviour change)", () => {
    const m = new MockRouteMapsAdapter();
    assert.equal(typeof (m.travelMatrix() as { minutes: unknown }).minutes, "function");
    assert.equal(Array.isArray(m.legs([{ id: "1", districtId: "a" }, { id: "2", districtId: "b" }])), true);
  });
});
