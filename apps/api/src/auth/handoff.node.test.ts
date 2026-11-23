import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HANDOFF_TTL_MS, HandoffCodes, HandoffError, MemoryHandoffStore, hashHandoffCode, homeOrigins, isHomeOrigin, newHandoffCode } from "./handoff";

const HOME = "http://localhost:5194";
function make(product: "clinic" | "pharmacy" | "lab" = "clinic") {
  let t = Date.parse("2026-11-24T10:00:00Z");
  const store = new MemoryHandoffStore();
  const codes = new HandoffCodes(store, product, { now: () => new Date(t) });
  return { store, codes, advance: (ms: number) => { t += ms; } };
}
const fails = (p: Promise<unknown>) => assert.rejects(p, (e) => e instanceof HandoffError && (e as HandoffError).code === "HANDOFF_INVALID");

describe("Kiorly Home handoff code (ADR-038)", () => {
  it("is 256 random bits, base64url, different every time, and only its SHA-256 hash is stored", async () => {
    const { codes, store } = make();
    const a = await codes.issue({ subjectId: "s1", origin: HOME });
    const b = await codes.issue({ subjectId: "s1", origin: HOME });
    assert.match(a.code, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a.code, b.code);
    assert.equal(Buffer.from(a.code, "base64url").length, 32);
    assert.equal(a.expiresInSeconds, 30);
    assert.ok(!JSON.stringify([...store.rows.values()]).includes(a.code));
    assert.ok(store.rows.has(hashHandoffCode(a.code)));
  });
  it("redeems once and returns the bound subject, origin and edition", async () => {
    const { codes } = make();
    const { code } = await codes.issue({ subjectId: "staff-7", origin: HOME, edition: "NURSE" });
    assert.deepEqual(await codes.redeem({ code, edition: "NURSE" }), { subjectId: "staff-7", origin: HOME, edition: "NURSE" });
  });
  it("replay is refused (single use), also after the first redeem succeeded", async () => {
    const { codes } = make();
    const { code } = await codes.issue({ subjectId: "s1", origin: HOME });
    await codes.redeem({ code });
    await fails(codes.redeem({ code }));
  });
  it("two redeems racing for the same code: exactly one wins", async () => {
    const { codes } = make();
    const { code } = await codes.issue({ subjectId: "s1", origin: HOME });
    const r = await Promise.allSettled([codes.redeem({ code }), codes.redeem({ code }), codes.redeem({ code })]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  });
  it("expires after 30 seconds (and is still valid just before)", async () => {
    const m = make();
    const early = await m.codes.issue({ subjectId: "s1", origin: HOME });
    m.advance(HANDOFF_TTL_MS - 1);
    await m.codes.redeem({ code: early.code });
    const late = await m.codes.issue({ subjectId: "s1", origin: HOME });
    m.advance(HANDOFF_TTL_MS);
    await fails(m.codes.redeem({ code: late.code }));
  });
  it("is bound to the product: a code issued for another product never redeems here", async () => {
    const store = new MemoryHandoffStore();
    const lab = new HandoffCodes(store, "lab"); const pharmacy = new HandoffCodes(store, "pharmacy");
    const { code } = await lab.issue({ subjectId: "s1", origin: HOME });
    await fails(pharmacy.redeem({ code }));
  });
  it("is bound to the edition (a Nurse code does not open the Clinic edition and the other way round)", async () => {
    const { codes } = make("clinic");
    const n = await codes.issue({ subjectId: "u", origin: HOME, edition: "NURSE" });
    await fails(codes.redeem({ code: n.code }));
    const c = await codes.issue({ subjectId: "u", origin: HOME });
    await fails(codes.redeem({ code: c.code, edition: "NURSE" }));
  });
  it("is bound to the Home origin it was issued for (expectOrigin must match)", async () => {
    const { codes } = make();
    const a = await codes.issue({ subjectId: "s1", origin: HOME });
    await fails(codes.redeem({ code: a.code, expectOrigin: "https://evil.example" }));
    const b = await codes.issue({ subjectId: "s1", origin: `${HOME}/` });
    assert.equal((await codes.redeem({ code: b.code, expectOrigin: HOME })).origin, HOME);
  });
  it("garbage, wrong-length, missing and non-string codes fail the same way", async () => {
    const { codes } = make();
    for (const bad of [undefined, null, 42, "", "short", "x".repeat(44), `${newHandoffCode()}!`, { code: "a" }]) await fails(codes.redeem({ code: bad }));
  });
  it("the error never contains the code", async () => {
    const { codes } = make();
    const code = newHandoffCode();
    await assert.rejects(codes.redeem({ code }), (e: Error) => !e.message.includes(code) && !JSON.stringify(e).includes(code));
  });
  it("Home origin allow-list: local default only outside production; KIORLY_HOME_ORIGINS wins; anything else is refused", () => {
    assert.deepEqual(homeOrigins({ NODE_ENV: "development" }), ["http://localhost:5194", "http://127.0.0.1:5194"]);
    assert.deepEqual(homeOrigins({ NODE_ENV: "production" }), []);
    assert.deepEqual(homeOrigins({ NODE_ENV: "production", KIORLY_HOME_ORIGINS: "https://www.kiorly.com/, https://kiorly.com" }), ["https://www.kiorly.com", "https://kiorly.com"]);
    const prod = { NODE_ENV: "production", KIORLY_HOME_ORIGINS: "https://www.kiorly.com" };
    assert.equal(isHomeOrigin("https://www.kiorly.com", prod), true);
    assert.equal(isHomeOrigin("https://www.kiorly.com.evil.example", prod), false);
    assert.equal(isHomeOrigin("http://localhost:5194", prod), false);
    assert.equal(isHomeOrigin(undefined, prod), false);
  });
});
