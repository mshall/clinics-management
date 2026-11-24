import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { assertProductionSecrets, clientIpOf, devAuthHelpersEnabled, secretsEqual, securityHeaderMap, swaggerEnabled, trustedProxyHops } from "./http-hardening";
import { consumeRateLimit, LOGIN_ACCOUNT_RATE } from "./rate-limit";
import { assertPublicWebhookUrl, isNonPublicAddress, parseWebhookTarget, safeRequest, UnsafeUrlError } from "./safe-outbound";

/** Pentest 2026-11 regression tests (clinics-management): SSRF guard, client IP / X-Forwarded-For, dev auth helpers, headers, per-account login limit. */
const PROD = { NODE_ENV: "production" } as const;

describe("SSRF guard: isNonPublicAddress", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fd00::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "2001:db8::1", "ff02::1", "not-an-ip"]) {
    it(`blocks ${a}`, () => assert.equal(isNonPublicAddress(a), true));
  }
  for (const a of ["8.8.8.8", "1.1.1.1", "52.1.2.3", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) it(`allows ${a}`, () => assert.equal(isNonPublicAddress(a), false));
});

describe("SSRF guard: URL shape and resolution (production)", () => {
  for (const u of ["http://example.com/hook", "https://127.0.0.1/x", "https://169.254.169.254/latest/meta-data/", "https://[::1]/x", "https://localhost/x", "https://svc.internal/x", "https://user:pw@example.com/x", "ftp://example.com/x", "file:///etc/passwd", "https://0x7f000001/", "https://2130706433/", "javascript:alert(1)", "not a url"]) {
    it(`rejects ${u}`, () => assert.throws(() => parseWebhookTarget(u, PROD), UnsafeUrlError));
  }
  it("rejects a public-looking name that resolves to a private address (DNS rebinding / split horizon)", async () => {
    await assert.rejects(assertPublicWebhookUrl("https://evil.example/x", PROD, async () => ["10.0.0.5"]), /private or reserved/);
    await assert.rejects(assertPublicWebhookUrl("https://evil.example/x", PROD, async () => ["8.8.8.8", "169.254.169.254"]), /private or reserved/);
    await assert.rejects(assertPublicWebhookUrl("https://evil.example/x", PROD, async () => { throw new Error("NXDOMAIN"); }), /does not resolve/);
  });
  it("accepts a public https URL", async () => {
    const u = await assertPublicWebhookUrl("https://hooks.example.org/kiorly", PROD, async () => ["93.184.216.34"]);
    assert.equal(u.hostname, "hooks.example.org");
  });
  it("private targets are allowed only outside production (or by explicit operator opt-in)", async () => {
    assert.doesNotThrow(() => parseWebhookTarget("http://localhost:9999/hook", { NODE_ENV: "development" }));
    assert.doesNotThrow(() => parseWebhookTarget("http://10.0.0.7/hook", { NODE_ENV: "production", WEBHOOK_ALLOW_PRIVATE_TARGETS: "true" }));
  });
});

describe("SSRF guard: safeRequest enforces the address at connect time and never follows redirects", () => {
  it("refuses to connect when the name resolves to a private address in production mode", async () => {
    const lookup = ((_h: string, _o: unknown, cb: (e: null, a: unknown) => void) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never;
    await assert.rejects(safeRequest("https://rebind.example/x", { method: "POST", body: "{}" }, PROD, lookup), UnsafeUrlError);
  });
  it("does not follow a 302 to an internal address (dev mode, local receiver)", async () => {
    let hits = 0;
    const internal = createServer((_q, r) => { hits++; r.end("secret-metadata"); });
    await new Promise<void>((r) => internal.listen(0, "127.0.0.1", r));
    const ip = (internal.address() as { port: number }).port;
    const redirector = createServer((_q, r) => { r.writeHead(302, { location: `http://127.0.0.1:${ip}/latest/meta-data` }); r.end(); });
    await new Promise<void>((r) => redirector.listen(0, "127.0.0.1", r));
    try {
      const res = await safeRequest(`http://127.0.0.1:${(redirector.address() as { port: number }).port}/h`, { method: "POST", body: "{}" }, { NODE_ENV: "development" });
      assert.equal(res.status, 302); assert.equal(res.ok, false); assert.equal(hits, 0);
      assert.ok(!(await res.text()).includes("secret-metadata"));
    } finally { internal.close(); redirector.close(); }
  });
  it("caps the response body it hands back", async () => {
    const big = createServer((_q, r) => r.end("x".repeat(100_000)));
    await new Promise<void>((r) => big.listen(0, "127.0.0.1", r));
    try {
      const res = await safeRequest(`http://127.0.0.1:${(big.address() as { port: number }).port}/`, { method: "POST", body: "{}", maxBodyBytes: 512 }, { NODE_ENV: "development" });
      assert.ok((await res.text()).length <= 512);
    } finally { big.close(); }
  });
});

describe("client IP and X-Forwarded-For", () => {
  const req = (xff: string | undefined, peer = "10.9.9.9") => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: peer } });
  it("ignores X-Forwarded-For entirely when no proxy is trusted (default)", () => {
    assert.equal(clientIpOf(req("1.2.3.4")), "10.9.9.9");
    assert.equal(clientIpOf(req("1.2.3.4, 5.6.7.8")), "10.9.9.9");
  });
  it("with 2 trusted hops a client-prepended entry cannot choose its own address", () => {
    const env = { TRUSTED_PROXY_HOPS: "2" };
    assert.equal(clientIpOf(req("203.0.113.9, 198.51.100.7"), env), "203.0.113.9");
    assert.equal(clientIpOf(req("6.6.6.6, 203.0.113.9, 198.51.100.7"), env), "203.0.113.9"); // forged leftmost entry is not used
    assert.equal(clientIpOf(req("198.51.100.7"), env), "10.9.9.9"); // too short: fall back to the peer
  });
  it("garbage TRUSTED_PROXY_HOPS means 0", () => { assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "abc" }), 0); assert.equal(trustedProxyHops({ TRUSTED_PROXY_HOPS: "50" }), 0); });
});

describe("dev auth helpers and swagger in production", () => {
  it("SIGNUP_OTP_DEV_CODE / AUTH_RESET_DEV_EXPOSE are honoured only outside production", () => {
    assert.equal(devAuthHelpersEnabled({ NODE_ENV: "production" }), false);
    assert.equal(devAuthHelpersEnabled({ NODE_ENV: "development" }), true);
    assert.equal(devAuthHelpersEnabled({ NODE_ENV: "test" }), true);
    assert.equal(devAuthHelpersEnabled({ NODE_ENV: "production", ALLOW_DEV_AUTH_HELPERS: "true" }), true);
  });
  it("swagger is off in production by default", () => {
    assert.equal(swaggerEnabled({ NODE_ENV: "production" }), false);
    assert.equal(swaggerEnabled({ NODE_ENV: "production", SWAGGER_ENABLED: "true" }), true);
    assert.equal(swaggerEnabled({ NODE_ENV: "development" }), true);
    assert.equal(swaggerEnabled({ SWAGGER_ENABLED: "false" }), false);
  });
  it("security headers", () => {
    const h = securityHeaderMap(PROD);
    assert.equal(h["X-Content-Type-Options"], "nosniff"); assert.equal(h["X-Frame-Options"], "DENY"); assert.match(h["Strict-Transport-Security"] ?? "", /max-age=31536000/);
    assert.equal(securityHeaderMap({ NODE_ENV: "development" })["Strict-Transport-Security"], undefined);
  });
  it("secretsEqual is exact and length-safe", () => { assert.equal(secretsEqual("abc", "abc"), true); assert.equal(secretsEqual("abc", "abd"), false); assert.equal(secretsEqual("abc", "abcd"), false); assert.equal(secretsEqual(undefined, "x"), false); assert.equal(secretsEqual("", ""), false); });
});

describe("per-account login throttle", () => {
  it("21st login attempt for one e-mail inside 15 minutes is refused regardless of source IP", () => {
    const store = new Map();
    const now = Date.now();
    for (let i = 0; i < LOGIN_ACCOUNT_RATE.limit; i++) assert.equal(consumeRateLimit("acct|victim@example.com", LOGIN_ACCOUNT_RATE.limit, LOGIN_ACCOUNT_RATE.windowMs, now + i, store).ok, true);
    assert.equal(consumeRateLimit("acct|victim@example.com", LOGIN_ACCOUNT_RATE.limit, LOGIN_ACCOUNT_RATE.windowMs, now + 30, store).ok, false);
    assert.equal(consumeRateLimit("acct|other@example.com", LOGIN_ACCOUNT_RATE.limit, LOGIN_ACCOUNT_RATE.windowMs, now + 30, store).ok, true);
  });
});

describe("production JWT secret", () => {
  it("refuses a short or published JWT_SECRET in production, accepts a strong one, ignores development", () => {
    assert.throws(() => assertProductionSecrets({ NODE_ENV: "production" }), /JWT_SECRET/);
    assert.throws(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: "short" }), /JWT_SECRET/);
    assert.throws(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: "dev-only-secret-change-me-dev-only-secret-change-me" }), /JWT_SECRET/);
    assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: "a".repeat(8) + "Zx9".repeat(20) }));
    assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: "production", JWT_SECRET: JSON.stringify({ jwt: "Zx9".repeat(20) }) }));
    assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: "development" }));
    assert.doesNotThrow(() => assertProductionSecrets({ NODE_ENV: "production", ALLOW_INSECURE_DEFAULT_SECRETS: "true" }));
  });
});
