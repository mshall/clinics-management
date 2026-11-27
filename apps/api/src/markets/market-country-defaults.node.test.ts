import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKET_COUNTRY_DEFAULTS, countryDefaultsFor, isValidIanaTimezone, normalizeMarketCreate } from "./market-country-defaults";
import { parseTransitionInput } from "./market-transition-input";
import { actorFromSignedBody } from "./market-actor";

/** The web table is read as text (the API build must not compile web sources) and evaluated as plain data. */
function webCountryOptions(): Array<Record<string, unknown>> {
  const src = readFileSync(join(__dirname, "../../../web/src/lib/market-pack-options.ts"), "utf8");
  const body = src.slice(src.indexOf("export const MARKET_COUNTRY_OPTIONS = [") + "export const MARKET_COUNTRY_OPTIONS = ".length, src.indexOf("] as const;") + 1);
  return new Function(`return ${body}`)() as Array<Record<string, unknown>>;
}

describe("country defaults table", () => {
  it("web form options and API defaults are the same table", () => {
    const MARKET_COUNTRY_OPTIONS = webCountryOptions();
    assert.equal(MARKET_COUNTRY_OPTIONS.length, MARKET_COUNTRY_DEFAULTS.length);
    assert.deepEqual(
      MARKET_COUNTRY_OPTIONS.map((c) => ({ ...c })),
      MARKET_COUNTRY_DEFAULTS.map((c) => ({ ...c })),
    );
  });
  it("every default is itself valid", () => {
    for (const c of MARKET_COUNTRY_DEFAULTS) {
      const r = normalizeMarketCreate({ code: c.code });
      assert.deepEqual(r.issues, [], c.code);
      assert.equal(r.value?.defaultLocale, c.defaultLocale);
    }
  });
});

describe("normalizeMarketCreate (initiate country launch)", () => {
  it("fills every API-required value from the country when only the code is sent (the reported bug)", () => {
    const r = normalizeMarketCreate({ code: "sa", nameEn: "Saudi Arabia", defaultCurrency: "SAR", defaultTimezone: "Asia/Riyadh" });
    assert.deepEqual(r.issues, []);
    assert.equal(r.value?.code, "SA");
    assert.equal(r.value?.defaultLocale, "ar-SA");
    assert.equal(r.value?.defaultPhoneRegion, "SA");
    assert.deepEqual(r.value?.weekendDays, [5, 6]);
    assert.deepEqual(r.value?.enabledLanguages, ["ar", "en"]);
  });
  it("an unknown country must supply every value", () => {
    const r = normalizeMarketCreate({ code: "ZZ", nameEn: "Zedland" });
    const fields = r.issues.map((i) => i.field).sort();
    assert.deepEqual(fields, ["defaultCurrency", "defaultLocale", "defaultPhoneRegion", "defaultTimezone", "enabledLanguages", "weekendDays"]);
  });
  it("accepts an explicit unknown country with all values", () => {
    const r = normalizeMarketCreate({ code: "ZZ", nameEn: "Zedland", defaultCurrency: "USD", defaultTimezone: "UTC", defaultLocale: "en-US", defaultPhoneRegion: "ZZ", weekendDays: [0], enabledLanguages: ["en"] });
    assert.deepEqual(r.issues, []);
  });
  const hostile: Array<[string, Record<string, unknown>, string]> = [
    ["code with three letters", { code: "EGY" }, "code"],
    ["code with digits", { code: "E1" }, "code"],
    ["empty code", { code: "" }, "code"],
    ["code not a string", { code: 20 }, "code"],
    ["sql in code", { code: "E'; DROP TABLE" }, "code"],
    ["unsupported currency", { code: "EG", defaultCurrency: "XXX" }, "defaultCurrency"],
    ["bad timezone", { code: "EG", defaultTimezone: "Mars/Olympus" }, "defaultTimezone"],
    ["timezone with script", { code: "EG", defaultTimezone: "<script>" }, "defaultTimezone"],
    ["bad locale", { code: "EG", defaultLocale: "Arabic (Egypt)" }, "defaultLocale"],
    ["phone region 3 letters", { code: "EG", defaultPhoneRegion: "EGY" }, "defaultPhoneRegion"],
    ["weekend days out of range", { code: "EG", weekendDays: [7] }, "weekendDays"],
    ["weekend days negative", { code: "EG", weekendDays: [-1] }, "weekendDays"],
    ["weekend days empty", { code: "EG", weekendDays: [] }, "weekendDays"],
    ["weekend days duplicate", { code: "EG", weekendDays: [5, 5] }, "weekendDays"],
    ["weekend days four", { code: "EG", weekendDays: [0, 1, 2, 3] }, "weekendDays"],
    ["weekend days not integers", { code: "EG", weekendDays: [1.5] }, "weekendDays"],
    ["weekend days strings", { code: "EG", weekendDays: ["5"] }, "weekendDays"],
    ["languages empty", { code: "EG", enabledLanguages: [] }, "enabledLanguages"],
    ["languages uppercase", { code: "EG", enabledLanguages: ["AR"] }, "enabledLanguages"],
    ["languages seven", { code: "EG", enabledLanguages: ["aa", "bb", "cc", "dd", "ee", "ff", "gg"] }, "enabledLanguages"],
    ["name too long", { code: "EG", nameEn: "x".repeat(201) }, "nameEn"],
    ["bad region", { code: "EG", dataRegion: "frankfurt" }, "dataRegion"],
    ["bad host cell", { code: "EG", hostCell: "Frankfurt Cell!" }, "hostCell"],
  ];
  for (const [name, body, field] of hostile) {
    it(`refuses: ${name}`, () => {
      const r = normalizeMarketCreate({ nameEn: "N", ...body });
      assert.ok(r.issues.some((i) => i.field === field), JSON.stringify(r.issues));
      assert.equal(r.value, undefined);
    });
  }
  it("boundary: name of exactly 200 characters is accepted", () => {
    assert.deepEqual(normalizeMarketCreate({ code: "EG", nameEn: "x".repeat(200) }).issues, []);
  });
  it("boundary: three weekend days accepted", () => {
    assert.deepEqual(normalizeMarketCreate({ code: "EG", weekendDays: [4, 5, 6] }).issues, []);
  });
  it("timezone check", () => {
    assert.ok(isValidIanaTimezone("Africa/Cairo"));
    assert.ok(isValidIanaTimezone("UTC"));
    assert.ok(!isValidIanaTimezone(""));
    assert.ok(!isValidIanaTimezone("a".repeat(65)));
    assert.equal(countryDefaultsFor(" eg ")?.code, "EG");
    assert.equal(countryDefaultsFor(null), null);
  });
});

describe("parseTransitionInput", () => {
  const ok = { reason: "Counsel approved the launch" };
  it("requires a reason of 3 to 1000 characters", () => {
    assert.throws(() => parseTransitionInput({}), /REASON|reason/i);
    assert.throws(() => parseTransitionInput({ reason: "  ab " }));
    assert.equal(parseTransitionInput({ reason: "abc" }).reason, "abc");
    assert.equal(parseTransitionInput({ reason: "x".repeat(1000) }).reason.length, 1000);
    assert.throws(() => parseTransitionInput({ reason: "x".repeat(1001) }));
    assert.throws(() => parseTransitionInput(null));
    assert.throws(() => parseTransitionInput("reason"));
    assert.throws(() => parseTransitionInput({ reason: 12345 }));
  });
  it("strips control characters and NUL bytes", () => {
    assert.equal(parseTransitionInput({ reason: "ab\u0000c\u0007d" }).reason, "abcd");
    assert.throws(() => parseTransitionInput({ reason: "\u0000\u0000\u0000" }));
  });
  it("keeps Arabic text and newlines", () => {
    assert.equal(parseTransitionInput({ reason: "موافقة المستشار\nالقانوني" }).reason, "موافقة المستشار\nالقانوني");
  });
  it("approval link must be https", () => {
    assert.throws(() => parseTransitionInput({ ...ok, approvalLink: "http://x.example/a" }));
    assert.throws(() => parseTransitionInput({ ...ok, approvalLink: "javascript:alert(1)" }));
    assert.throws(() => parseTransitionInput({ ...ok, approvalLink: "not a url" }));
    assert.throws(() => parseTransitionInput({ ...ok, approvalLink: 5 }));
    assert.equal(parseTransitionInput({ ...ok, approvalLink: "https://docs.example/a" }).approvalLink, "https://docs.example/a");
    assert.equal(parseTransitionInput({ ...ok, approvalLink: "" }).approvalLink, null);
  });
  it("approval reference length", () => {
    assert.equal(parseTransitionInput({ ...ok, approvalRef: "x".repeat(128) }).approvalRef?.length, 128);
    assert.throws(() => parseTransitionInput({ ...ok, approvalRef: "x".repeat(129) }));
  });
  it("pause days: default 7, whole numbers 1..365 only", () => {
    assert.equal(parseTransitionInput(ok, { allowDays: true }).days, 7);
    assert.equal(parseTransitionInput({ ...ok, days: 1 }, { allowDays: true }).days, 1);
    assert.equal(parseTransitionInput({ ...ok, days: 365 }, { allowDays: true }).days, 365);
    for (const bad of [0, 366, -3, 1.5, "7", Number.NaN, Infinity, 1e9, [], {}]) {
      assert.throws(() => parseTransitionInput({ ...ok, days: bad }, { allowDays: true }), /./, String(bad));
    }
    assert.equal(parseTransitionInput({ ...ok, days: 99 }).days, undefined);
  });
});

describe("actorFromSignedBody", () => {
  it("accepts a plain id and prefixes the source", () => {
    const a = actorFromSignedBody({ id: "user-123", email: "ops@example.com" });
    assert.equal(a.id, "kiorly-admin:user-123");
    assert.equal(a.source, "KIORLY_ADMIN");
  });
  it("refuses a missing, empty, oversized or hostile actor", () => {
    for (const bad of [undefined, null, {}, { id: "" }, { id: " " }, { id: "x".repeat(201) }, { id: "a b" }, { id: "<x>" }, { id: 5 }, "admin"]) {
      assert.throws(() => actorFromSignedBody(bad), /./, JSON.stringify(bad));
    }
  });
  it("ignores an oversized email instead of storing it", () => {
    assert.equal(actorFromSignedBody({ id: "u1", email: "x".repeat(300) }).email, null);
  });
});
