import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setSecretsAdapter } from "../platform/adapters";
import { AwsSecretsManagerAdapter } from "../platform/adapters/secrets.adapter";
import { CloudflareTurnProvider, normalizeCloudflareIceServers, turnSecretName } from "./turn/cloudflare-turn.provider";
import { StunOnlyTurnProvider } from "./turn/stun-only.provider";
import { P2PWebRtcProvider } from "./video/p2p-webrtc.provider";

const CF = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u1", credential: "c1" },
  ],
};
const SECRET = JSON.stringify({ turnKeyId: "key123", apiToken: "tok-secret-value" });

afterEach(() => {
  setSecretsAdapter(new AwsSecretsManagerAdapter());
  delete process.env.TELEHEALTH_TURN_SECRET_NAME;
});

describe("ADR-039 TURN credentials", () => {
  it("normalizes: drops port-53 urls, keeps STUN + TURN, tolerates garbage", () => {
    const out = normalizeCloudflareIceServers(CF);
    assert.deepEqual(out[0]!.urls, ["stun:stun.cloudflare.com:3478"]);
    assert.deepEqual(out[1]!.urls, ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"]);
    assert.equal(out[1]!.credential, "c1");
    assert.deepEqual(normalizeCloudflareIceServers(null), []);
    assert.deepEqual(normalizeCloudflareIceServers({ iceServers: "x" }), []);
  });

  it("calls the documented endpoint with bearer + ttl and never logs the token", async () => {
    setSecretsAdapter({ getSecret: async (ref) => (ref === "/kiorly-clinic/staging/cloudflare-turn" ? SECRET : null) });
    const calls: { url: string; init: RequestInit }[] = [];
    const p = new CloudflareTurnProvider((async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(CF), { status: 201 });
    }) as unknown as typeof fetch);
    const r = await p.getIceServers({ ttlSeconds: 1800 });
    assert.equal(r.turn, "turn");
    assert.equal(calls[0]!.url, "https://rtc.live.cloudflare.com/v1/turn/keys/key123/credentials/generate-ice-servers");
    assert.equal(calls[0]!.init.method, "POST");
    assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, "Bearer tok-secret-value");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { ttl: 1800 });
    assert.equal(r.expiresInSeconds, 1800);
    assert.ok(!JSON.stringify(r).includes("tok-secret-value"), "API token never reaches the browser");
  });

  it("clamps the ttl (min 10 min, max 4 h)", async () => {
    setSecretsAdapter({ getSecret: async () => SECRET });
    const bodies: unknown[] = [];
    const p = new CloudflareTurnProvider((async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(CF), { status: 201 });
    }) as unknown as typeof fetch);
    await p.getIceServers({ ttlSeconds: 5 });
    assert.deepEqual(bodies[0], { ttl: 600 });
  });

  it("falls back to STUN-only when there is no secret (local dev / CI)", async () => {
    setSecretsAdapter({ getSecret: async () => null });
    let called = false;
    const p = new CloudflareTurnProvider((async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch);
    const r = await p.getIceServers({ ttlSeconds: 3600 });
    assert.equal(r.turn, "stun-only");
    assert.equal(called, false);
    assert.ok(r.iceServers.every((s) => !s.credential));
  });

  it("falls back to STUN-only (degraded) when Cloudflare fails, without leaking the token", async () => {
    setSecretsAdapter({ getSecret: async () => SECRET });
    const logs: string[] = [];
    const p = new CloudflareTurnProvider((async () => new Response("nope", { status: 500 })) as unknown as typeof fetch);
    (p as unknown as { log: { warn: (m: string) => void } }).log = { warn: (m: string) => logs.push(m) };
    const r = await p.getIceServers({ ttlSeconds: 3600 });
    assert.equal(r.turn, "degraded");
    assert.ok(r.iceServers.length > 0);
    assert.ok(logs.length === 1 && !logs[0]!.includes("tok-secret-value") && !logs[0]!.includes("key123"));
  });

  it("secret name: /kiorly-clinic/{env}/cloudflare-turn by default, explicit override wins", () => {
    process.env.KIORLY_ENV = "prod";
    assert.equal(turnSecretName(), "/kiorly-clinic/prod/cloudflare-turn");
    process.env.TELEHEALTH_TURN_SECRET_NAME = "/custom/name";
    assert.equal(turnSecretName(), "/custom/name");
    delete process.env.KIORLY_ENV;
  });

  it("P2PWebRtcProvider is browser-to-browser: stun-only provider yields no relay", async () => {
    const v = new P2PWebRtcProvider(new StunOnlyTurnProvider());
    const j = await v.prepareJoin({ remainingWindowSeconds: 600 });
    assert.equal(j.transport, "p2p-webrtc");
    assert.equal(j.turn, "stun-only");
  });
});
