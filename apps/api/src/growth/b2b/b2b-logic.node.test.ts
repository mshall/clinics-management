import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanReferral, companyKey, looksPersonal, SIZE_BUCKETS } from "./b2b-logic";

describe("GRW-P4-C B2B referral rules", () => {
  it("normalises a company name to one key across case, spacing, punctuation and scripts", () => {
    assert.equal(companyKey("Nile  Logistics, Ltd."), companyKey("nile logistics ltd"));
    assert.equal(companyKey("شركة النيل للخدمات"), companyKey("شركة  النيل  للخدمات!"));
    assert.notEqual(companyKey("Nile Logistics"), companyKey("Nile Logistics Egypt"));
    assert.equal(companyKey("!!!"), "");
  });
  it("accepts a company with a size bucket and an opaque contact reference, trims and drops control characters", () => {
    const r = cleanReferral({ companyName: "  Nile\u0000 Logistics  ", sizeBucket: "200_999", contactRef: " ref-hr-1 " });
    assert.ok(r.ok);
    assert.deepEqual(r.value, { companyName: "Nile Logistics", companyKey: "nilelogistics", sizeBucket: "200_999", contactRef: "ref-hr-1" });
    assert.equal(cleanReferral({ companyName: "Acme" }).ok && (cleanReferral({ companyName: "Acme" }) as { value: { sizeBucket: string } }).value.sizeBucket, "UNKNOWN");
  });
  it("refuses a missing, tiny, huge or symbol-only name and an unknown size bucket or long reference", () => {
    for (const n of [undefined, "", "a", "x".repeat(121), "!!!", 5]) assert.equal(cleanReferral({ companyName: n }).ok, false, String(n));
    assert.deepEqual(cleanReferral({ companyName: "Acme", sizeBucket: "HUGE" }), { ok: false, code: "INVALID", message: `sizeBucket must be one of ${SIZE_BUCKETS.join(", ")}` });
    assert.equal(cleanReferral({ companyName: "Acme", contactRef: "r".repeat(81) }).ok, false);
  });
  it("refuses a person: an e-mail address, a phone number, a national id, Arabic-Indic digits, in the name or the reference", () => {
    for (const bad of ["sara@acme.com", "+20 100 000 0001", "01000000001", "29004020101234", "٠١٠٠٠٠٠٠٠٠١", "0100-000-0001"]) {
      assert.equal(looksPersonal(bad), true, bad);
      assert.deepEqual((cleanReferral({ companyName: "Acme", contactRef: bad }) as { code: string }).code, "PERSONAL_DATA", bad);
      assert.deepEqual((cleanReferral({ companyName: `Acme ${bad}` }) as { code: string }).code, "PERSONAL_DATA", bad);
    }
    for (const ok of ["Acme 2027", "Floor 4, 120 staff", "ref-hr-1", "شركة النيل"]) assert.equal(looksPersonal(ok), false, ok);
  });
});
