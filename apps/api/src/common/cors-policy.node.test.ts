import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { corsOptionsDelegate, isOriginAllowed, normaliseOrigin, requestOrigin, resolveCorsPolicy } from "./cors-policy";

// Hosts below are test fixtures built from a reserved example domain, never a real deployment host.
const WEB = "https://web.example.test";
const OTHER = "https://other.example.test";

describe("CORS policy resolution", () => {
  it("unset: non-production reflects (local development), production keeps LEGACY reflection with a notice", () => {
    assert.equal(resolveCorsPolicy({ NODE_ENV: "development" }).mode, "legacy-reflect");
    const p = resolveCorsPolicy({ NODE_ENV: "production" });
    assert.equal(p.mode, "legacy-reflect");
    assert.match(p.notices.join(" "), /LEGACY MODE/);
    assert.equal(isOriginAllowed(p, OTHER, null), true);
    assert.deepEqual(resolveCorsPolicy({ NODE_ENV: "development" }).notices, []);
  });

  it("list: only listed origins, normalised; configured web origins are always added (config only)", () => {
    const p = resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: ` ${OTHER}/ , https://UPPER.example.test:443 `, APP_WEB_URL: `${WEB}/`, WEB_PUBLIC_ORIGIN: WEB });
    assert.equal(p.mode, "allow-list");
    assert.equal(isOriginAllowed(p, OTHER, null), true);
    assert.equal(isOriginAllowed(p, "https://upper.example.test", null), true);
    assert.equal(isOriginAllowed(p, WEB, null), true, "APP_WEB_URL is allowed without being in the list");
    assert.equal(isOriginAllowed(p, "https://evil.example.test", null), false);
    assert.equal(isOriginAllowed(p, `${OTHER}.evil.example.test`, null), false);
    assert.equal(isOriginAllowed(p, "null", null), false);
  });

  it("same-origin is always allowed, whatever the list holds", () => {
    const p = resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: OTHER });
    assert.equal(isOriginAllowed(p, WEB, normaliseOrigin(WEB)), true);
    assert.equal(isOriginAllowed(p, WEB, normaliseOrigin(OTHER)), false);
  });

  it("production: '*' is ignored and an empty or invalid list FAILS CLOSED", () => {
    for (const v of ["", " , ", "*", "http://insecure.example.test", "https://x.example.test/path", "not a url"]) {
      const p = resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: v });
      assert.equal(p.mode, "closed", `value ${JSON.stringify(v)}`);
      assert.equal(isOriginAllowed(p, OTHER, null), false);
      assert.equal(isOriginAllowed(p, WEB, normaliseOrigin(WEB)), true, "same-origin still works when closed");
      assert.ok(p.notices.length >= 1);
    }
  });

  it("production with an empty list still allows the configured web origin (the deployed site)", () => {
    const p = resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "", WEB_PUBLIC_ORIGIN: WEB });
    assert.equal(p.mode, "allow-list");
    assert.equal(isOriginAllowed(p, WEB, null), true);
    assert.equal(isOriginAllowed(p, OTHER, null), false);
  });

  it("'*' is honoured only outside production (explicit, local development)", () => {
    const p = resolveCorsPolicy({ NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "*" });
    assert.equal(p.mode, "wildcard-dev");
    assert.equal(isOriginAllowed(p, OTHER, null), true);
    assert.equal(resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: `*,${OTHER}` }).mode, "allow-list");
    assert.equal(isOriginAllowed(resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: `*,${OTHER}` }), "https://any.example.test", null), false);
  });

  it("http origins are allowed only outside production", () => {
    assert.equal(isOriginAllowed(resolveCorsPolicy({ NODE_ENV: "test", CORS_ALLOWED_ORIGINS: "http://localhost:5174" }), "http://localhost:5174", null), true);
    assert.equal(resolveCorsPolicy({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "http://localhost:5174" }).mode, "closed");
  });

  it("requestOrigin honours the proxy headers", () => {
    assert.equal(requestOrigin({ headers: { host: "api.internal", "x-forwarded-host": "web.example.test", "x-forwarded-proto": "https" } }), WEB);
    assert.equal(requestOrigin({ headers: { host: "localhost:3000" }, protocol: "http" }), "http://localhost:3000");
    assert.equal(requestOrigin({ headers: {} }), null);
  });
});

@Controller("ping")
class PingController { @Get() ping() { return { ok: true }; } }
@Module({ controllers: [PingController] })
class PingModule {}

async function withServer(env: Record<string, string | undefined>, fn: (base: string) => Promise<void>) {
  const app = await NestFactory.create(PingModule, { logger: false });
  app.enableCors(corsOptionsDelegate(resolveCorsPolicy(env)) as never);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try { await fn(base.replace("[::1]", "127.0.0.1")); } finally { await app.close(); }
}

describe("CORS over HTTP (real Nest app)", () => {
  const get = (base: string, origin?: string, headers: Record<string, string> = {}) => fetch(`${base}/ping`, { headers: { ...(origin ? { origin } : {}), ...headers } });

  it("allow-list: listed origin gets the header, others do not, no credentials header ever", async () => {
    await withServer({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: OTHER, WEB_PUBLIC_ORIGIN: WEB }, async (base) => {
      const ok = await get(base, OTHER);
      assert.equal(ok.headers.get("access-control-allow-origin"), OTHER);
      assert.equal(ok.headers.get("access-control-allow-credentials"), null);
      assert.equal((await get(base, WEB)).headers.get("access-control-allow-origin"), WEB);
      const bad = await get(base, "https://evil.example.test");
      assert.equal(bad.status, 200, "the request itself is served; only the browser is denied the response");
      assert.equal(bad.headers.get("access-control-allow-origin"), null);
      const pre = await fetch(`${base}/ping`, { method: "OPTIONS", headers: { origin: "https://evil.example.test", "access-control-request-method": "GET" } });
      assert.equal(pre.headers.get("access-control-allow-origin"), null);
    });
  });

  it("same-origin (Origin equals the addressed host) is allowed even with an empty list", async () => {
    await withServer({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "" }, async (base) => {
      const sameOrigin = new URL(base).origin;
      assert.equal((await get(base, sameOrigin)).headers.get("access-control-allow-origin"), sameOrigin);
      assert.equal((await get(base, OTHER)).headers.get("access-control-allow-origin"), null);
      assert.equal((await get(base, WEB, { "x-forwarded-host": "web.example.test", "x-forwarded-proto": "https" })).headers.get("access-control-allow-origin"), WEB);
    });
  });

  it("legacy (variable unset) reflects like before; native clients without Origin are untouched", async () => {
    await withServer({ NODE_ENV: "production" }, async (base) => {
      assert.equal((await get(base, OTHER)).headers.get("access-control-allow-origin"), OTHER);
      const r = await get(base);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("access-control-allow-origin"), null);
    });
  });
});
