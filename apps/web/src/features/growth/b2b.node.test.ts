/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { b2bAr, b2bEn } from "./b2b-strings";
import { b2bErrorCode, b2bProblem, looksPersonal, SIZE_BUCKETS } from "./b2b-logic";

const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: any, path: string): string => path.split(".").reduce((x: any, p) => x[p], o);

describe("GRW-P4-C refer a company: wording", () => {
  it("English and Arabic have identical keys, no empty values and the same placeholders", () => {
    assert.deepEqual(flat(b2bEn).sort(), flat(b2bAr).sort());
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of flat(b2bEn)) { assert.ok(get(b2bEn, k).length > 0 && get(b2bAr, k).length > 0, k); assert.equal(ph(get(b2bEn, k)), ph(get(b2bAr, k)), k); }
  });
  it("Arabic wording is Arabic (Latin only in the size digits) and says plainly that there is no reward", () => {
    for (const k of flat(b2bAr)) for (const w of get(b2bAr, k).match(/[A-Za-z]+/g) ?? []) assert.fail(`${k}: ${w}`);
    assert.match(b2bEn.noReward, /no reward, credit or fee share/); assert.match(b2bAr.noReward, /لا تمنح/);
  });
  it("no string promises money, a commission, a discount or a price", () => {
    const all = [...flat(b2bEn).map((k) => get(b2bEn, k))].join(" ").replace(b2bEn.noReward, "");
    assert.doesNotMatch(all, /earn|commission|bonus|payout|discount|price|EGP/i);
  });
  it("there is a size label for every bucket and an error text for every code the server can send", () => {
    for (const s of SIZE_BUCKETS) assert.ok(get(b2bEn, `sizes.${s}`) && get(b2bAr, `sizes.${s}`), s);
    for (const c of ["B2B_DUPLICATE", "B2B_RATE_LIMITED", "B2B_PERSONAL_DATA", "GROWTH_FORBIDDEN", "FEATURE_DISABLED", "GENERIC"]) assert.ok(get(b2bEn, `error.${c}`) && get(b2bAr, `error.${c}`), c);
  });
});

describe("GRW-P4-C refer a company: form rules", () => {
  it("accepts a company with or without a reference", () => { assert.equal(b2bProblem({ companyName: "Nile Logistics", contactRef: "" }), null); assert.equal(b2bProblem({ companyName: "شركة النيل", contactRef: "ref-hr-1" }), null); });
  it("refuses a short or long name, a person's contact data and a long reference before anything is sent", () => {
    assert.equal(b2bProblem({ companyName: "a", contactRef: "" }), "NAME"); assert.equal(b2bProblem({ companyName: "x".repeat(121), contactRef: "" }), "NAME");
    for (const bad of ["sara@acme.com", "+20 100 000 0001", "01000000001", "29004020101234", "٠١٠٠٠٠٠٠٠٠١"]) { assert.equal(looksPersonal(bad), true, bad); assert.equal(b2bProblem({ companyName: "Acme", contactRef: bad }), "PERSONAL"); assert.equal(b2bProblem({ companyName: `Acme ${bad}`, contactRef: "" }), "PERSONAL"); }
    assert.equal(b2bProblem({ companyName: "Acme", contactRef: "r".repeat(81) }), "REF_LENGTH");
  });
  it("reads the machine code of an API error", () => { assert.equal(b2bErrorCode({ body: { code: "B2B_DUPLICATE" } }), "B2B_DUPLICATE"); assert.equal(b2bErrorCode(new Error("x")), null); assert.equal(b2bErrorCode(null), null); });
});
