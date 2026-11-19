import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  digestChannelEnabled,
  isInQuietHours,
  mayDeliverDigest,
  normalizeDigestPrefs,
} from "./digest-policy";

describe("MS-04 digest quiet hours & opt-out", () => {
  it("quiet hours wrap midnight by default (21–08)", () => {
    assert.equal(isInQuietHours(21, 21, 8), true);
    assert.equal(isInQuietHours(23, 21, 8), true);
    assert.equal(isInQuietHours(3, 21, 8), true);
    assert.equal(isInQuietHours(7, 21, 8), true);
    assert.equal(isInQuietHours(8, 21, 8), false);
    assert.equal(isInQuietHours(20, 21, 8), false);
    assert.equal(isInQuietHours(12, 21, 8), false);
  });

  it("same start and end means never quiet", () => {
    assert.equal(isInQuietHours(0, 0, 0), false);
    assert.equal(isInQuietHours(15, 10, 10), false);
  });

  it("opt-out and per-channel flags block delivery", () => {
    const base = normalizeDigestPrefs({});
    assert.equal(mayDeliverDigest(base, "doctor_tomorrow", 20), true);
    assert.equal(mayDeliverDigest({ ...base, optOutAll: true }, "doctor_tomorrow", 20), false);
    assert.equal(digestChannelEnabled({ ...base, doctorTomorrowList: false }, "doctor_tomorrow"), false);
    assert.equal(mayDeliverDigest(base, "kiorex_progress", 22), false, "quiet at 22");
    assert.equal(mayDeliverDigest(base, "kiorex_progress", 10), true);
    assert.equal(mayDeliverDigest({ ...base, kiorexProgressNudges: false }, "monthly_recap", 10), false);
    assert.equal(mayDeliverDigest({ ...base, ownerShiftSummaries: false }, "owner_shift", 14), false);
  });
});
