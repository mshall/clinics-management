import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARKET_COUNTRY_OPTIONS } from "../../lib/market-pack-options";
import { ar, en, fill, marketStrings } from "./platform-markets-strings";
import { applyCountry, emptyLaunchForm, errorCodeOf, hostCellForRegion, messageForError, toCreateBody, toTransitionBody, transitionPath, validateLaunchForm, validateTransition } from "./platform-markets-logic";

const keysOf = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keysOf(v, `${prefix}${k}.`)) : [prefix.slice(0, -1)];

describe("Initiate country launch form", () => {
  it("every country fills currency, timezone, locale, phone region, weekend days and languages and validates", () => {
    for (const c of MARKET_COUNTRY_OPTIONS) {
      const f = applyCountry(emptyLaunchForm(), c.code);
      assert.deepEqual(validateLaunchForm(f), {}, c.code);
      const body = toCreateBody(f);
      for (const k of ["defaultCurrency", "defaultTimezone", "defaultLocale", "defaultPhoneRegion", "weekendDays", "enabledLanguages"] as const) {
        assert.ok(body[k] && (Array.isArray(body[k]) ? (body[k] as unknown[]).length : String(body[k]).length), `${c.code} ${k}`);
      }
    }
  });
  it("an empty form lists every missing field; picking a country clears them", () => {
    const bad = validateLaunchForm(emptyLaunchForm());
    for (const k of ["code", "nameEn", "currency", "timezone", "locale", "phoneRegion", "weekend", "languages"] as const) assert.equal(bad[k], true, k);
    assert.deepEqual(validateLaunchForm(applyCountry(emptyLaunchForm(), "SA")), {});
  });
  it("picking the empty option resets the country fields but keeps region and cell", () => {
    const f = { ...applyCountry(emptyLaunchForm(), "SA"), dataRegion: "me-south-1", hostCell: "cairo" };
    const r = applyCountry(f, "");
    assert.equal(r.code, "");
    assert.equal(r.dataRegion, "me-south-1");
    assert.equal(r.hostCell, "cairo");
  });
  it("boundary and hostile values", () => {
    const ok = applyCountry(emptyLaunchForm(), "EG");
    assert.equal(validateLaunchForm({ ...ok, nameEn: "x".repeat(200) }).nameEn, undefined);
    assert.equal(validateLaunchForm({ ...ok, nameEn: "x".repeat(201) }).nameEn, true);
    assert.equal(validateLaunchForm({ ...ok, nameEn: "   " }).nameEn, true);
    assert.equal(validateLaunchForm({ ...ok, defaultTimezone: "Mars/Base" }).timezone, true);
    assert.equal(validateLaunchForm({ ...ok, defaultTimezone: "<script>" }).timezone, true);
    assert.equal(validateLaunchForm({ ...ok, defaultLocale: "Arabic" }).locale, true);
    assert.equal(validateLaunchForm({ ...ok, defaultPhoneRegion: "EGY" }).phoneRegion, true);
    assert.equal(validateLaunchForm({ ...ok, weekendDays: [0, 1, 2, 3] }).weekend, true);
    assert.equal(validateLaunchForm({ ...ok, weekendDays: [] }).weekend, true);
    assert.equal(validateLaunchForm({ ...ok, enabledLanguages: [] }).languages, true);
    assert.equal(validateLaunchForm({ ...ok, dataRegion: "frankfurt" }).region, true);
    assert.equal(validateLaunchForm({ ...ok, hostCell: "Bad Cell" }).hostCell, true);
  });
  it("region choice maps to the registry cell", () => {
    assert.equal(hostCellForRegion("eu-central-1"), "frankfurt");
    assert.equal(hostCellForRegion("me-south-1"), "cairo");
    assert.equal(hostCellForRegion("us-west-2"), "us-west-2");
  });
  it("the body trims, upper-cases and sorts", () => {
    const b = toCreateBody({ ...applyCountry(emptyLaunchForm(), "SA"), code: " sa ", nameEn: "  Saudi ", nameAr: " ", defaultPhoneRegion: "sa", weekendDays: [6, 5] });
    assert.equal(b.code, "SA");
    assert.equal(b.nameEn, "Saudi");
    assert.equal(b.nameAr, undefined);
    assert.equal(b.defaultPhoneRegion, "SA");
    assert.deepEqual(b.weekendDays, [5, 6]);
  });
});

describe("Go live, Pause, Disable and Enable input", () => {
  const ok = { reason: "Counsel approved", approvalRef: "", approvalLink: "", days: "7" };
  it("a reason is required (3 to 1000)", () => {
    assert.equal(validateTransition("LAUNCH", { ...ok, reason: "" }), "REASON_REQUIRED");
    assert.equal(validateTransition("LAUNCH", { ...ok, reason: " ab " }), "REASON_REQUIRED");
    assert.equal(validateTransition("LAUNCH", { ...ok, reason: "abc" }), null);
    assert.equal(validateTransition("LAUNCH", { ...ok, reason: "x".repeat(1000) }), null);
    assert.equal(validateTransition("LAUNCH", { ...ok, reason: "x".repeat(1001) }), "REASON_TOO_LONG");
  });
  it("approval link must be https and approval reference at most 128", () => {
    assert.equal(validateTransition("LAUNCH", { ...ok, approvalLink: "http://a.example" }), "APPROVAL_LINK_INVALID");
    assert.equal(validateTransition("LAUNCH", { ...ok, approvalLink: "javascript:alert(1)" }), "APPROVAL_LINK_INVALID");
    assert.equal(validateTransition("LAUNCH", { ...ok, approvalLink: "nope" }), "APPROVAL_LINK_INVALID");
    assert.equal(validateTransition("LAUNCH", { ...ok, approvalLink: "https://a.example/x" }), null);
    assert.equal(validateTransition("LAUNCH", { ...ok, approvalRef: "x".repeat(129) }), "APPROVAL_REF_INVALID");
  });
  it("pause days are whole numbers 1 to 365 and only checked for Pause", () => {
    for (const d of ["0", "366", "-1", "1.5", "abc", "", " ", "1e3", "٣"]) assert.equal(validateTransition("PAUSE", { ...ok, days: d }), "PAUSE_DAYS_INVALID", d);
    for (const d of ["1", "365", "30"]) assert.equal(validateTransition("PAUSE", { ...ok, days: d }), null, d);
    assert.equal(validateTransition("DISABLE", { ...ok, days: "abc" }), null);
  });
  it("the body carries only what was entered", () => {
    assert.deepEqual(toTransitionBody("LAUNCH", ok), { reason: "Counsel approved" });
    assert.deepEqual(toTransitionBody("PAUSE", { ...ok, approvalRef: " R1 ", approvalLink: "https://a.example" }), { reason: "Counsel approved", approvalRef: "R1", approvalLink: "https://a.example", days: 7 });
    assert.equal(transitionPath("ENABLE"), "enable");
  });
});

describe("error display (Go live shows a clear message)", () => {
  const apiError = (code: string, message = "raw message") => Object.assign(new Error(message), { status: 400, body: { code, message } });
  it("reads the code from the API body and uses the translated text", () => {
    assert.equal(errorCodeOf(apiError("TAX_PACK_MISSING")), "TAX_PACK_MISSING");
    assert.equal(messageForError(apiError("TAX_PACK_MISSING"), en.errors, "", en.errors.generic), en.errors.TAX_PACK_MISSING);
    assert.equal(messageForError(apiError("TAX_PACK_MISSING"), ar.errors, "", ar.errors.generic), ar.errors.TAX_PACK_MISSING);
  });
  it("an unknown code falls back to the server message, then to the generic text", () => {
    assert.equal(messageForError(apiError("SOMETHING_NEW", "Server says no"), en.errors, "", en.errors.generic), "Server says no");
    assert.equal(messageForError(new Error("Request failed"), en.errors, "", en.errors.generic), en.errors.generic);
    assert.equal(messageForError(null, en.errors, "", en.errors.generic), en.errors.generic);
    assert.equal(messageForError("boom", en.errors, "", en.errors.generic), en.errors.generic);
    assert.equal(messageForError(new Error("x".repeat(500)), en.errors, "", en.errors.generic), en.errors.generic);
  });
  it("reads a nested Nest error body too", () => {
    assert.equal(errorCodeOf({ body: { message: { code: "MARKET_ALREADY_LIVE" } } }), "MARKET_ALREADY_LIVE");
  });
});

describe("EN and AR strings", () => {
  it("have exactly the same keys", () => {
    assert.deepEqual(keysOf(ar).sort(), keysOf(en).sort());
  });
  it("Arabic has no leftover English sentences in the user-facing blocks (spot check) and no empty values", () => {
    const empties = keysOf(ar).filter((k) => {
      const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], ar);
      return typeof v === "string" && v.trim() === "";
    });
    assert.deepEqual(empties, []);
    assert.notEqual(ar.title, en.title);
    assert.notEqual(ar.errors.TAX_PACK_MISSING, en.errors.TAX_PACK_MISSING);
  });
  it("language switch and placeholders", () => {
    assert.equal(marketStrings("ar-EG").title, ar.title);
    assert.equal(marketStrings("en").title, en.title);
    assert.equal(marketStrings(undefined).title, en.title);
    assert.equal(fill(ar.liveCount, { count: 3 }), "3 سوق مباشر");
  });
  it("every error code the API can return has a translation", () => {
    for (const code of ["REASON_REQUIRED", "MARKET_ALREADY_LIVE", "MARKET_NOT_LIVE", "TAX_PACK_MISSING", "CROSS_BORDER_APPROVAL_REQUIRED", "HOST_CELL_UNKNOWN", "PRODUCTION_BINDING_MISMATCH", "REQUEST_ALREADY_PENDING", "SECOND_APPROVER_MUST_DIFFER", "PLATFORM_SUPER_ADMIN_ONLY", "MARKET_EXISTS", "MARKET_INVALID"]) {
      assert.ok(typeof (en.errors as Record<string, unknown>)[code] === "string", `en ${code}`);
      assert.ok(typeof (ar.errors as Record<string, unknown>)[code] === "string", `ar ${code}`);
    }
  });
});
