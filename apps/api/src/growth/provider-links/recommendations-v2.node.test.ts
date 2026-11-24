import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveState } from "./growth-insights.service";
import { buildRecommendations, RECOMMENDATION_IDS, THRESHOLDS_V2, type RecommendationInput } from "./growth-recommendations";

const calm: RecommendationInput = { activeLinks: 2, hasDeskLink: true, widgetEnabled: true, widgetEntitled: true, pageReady: true, liveDoctors: 2, doctorsWithoutAvailability: 0, bookableTypes: 3, avgProfileCompleteness: 95, kiorexBookings30d: 40, cancelled30d: 2, noShow30d: 1, overdueConfirmations: 0 };
const ids = (o: Partial<RecommendationInput>) => buildRecommendations({ ...calm, ...o }).map((r) => r.id);

describe("GRW-P2-C recommendations v2: deterministic triggers", () => {
  it("a calm clinic with all new facts at zero gets nothing", () => {
    assert.deepEqual(ids({ doctorsWithoutPhoto: 0, doctorsWithIncompleteBio: 0, doctorsWithFewSlots: 0, unrepliedReviews30d: 0, doctorsSingleLanguage: 0, verificationRequestsPending: 0, linkVisits30d: 100, linkBookings30d: 20, pausedIdleLinks: 0, socialSharedLast30d: 3, disputesClosingSoon: 0, linksUsed: 3, maxActiveLinks: 25 }), []);
  });
  it("each rule fires on its own fact and carries its data window", () => {
    const cases: [Partial<RecommendationInput>, string, string | undefined][] = [
      [{ doctorsWithoutPhoto: 1 }, "PROFILE_PHOTO_MISSING", "now"],
      [{ doctorsWithIncompleteBio: 2 }, "PROFILE_BIO_INCOMPLETE", "now"],
      [{ doctorsWithFewSlots: 1 }, "PUBLISH_MORE_SLOTS", "next 7 days"],
      [{ unrepliedReviews30d: 3 }, "RESPOND_TO_REVIEW", "30d"],
      [{ doctorsSingleLanguage: 1 }, "ADD_LANGUAGE", "now"],
      [{ verificationRequestsPending: 1 }, "VERIFICATION_PENDING", "now"],
      [{ linkVisits30d: 100, linkBookings30d: 1 }, "LINK_CONVERSION_LOW", "30d"],
      [{ pausedIdleLinks: 1 }, "LINK_PAUSED_IDLE", "30d"],
      [{ socialSharedLast30d: 0 }, "SOCIAL_TEMPLATE_UNUSED", "30d"],
      [{ disputesClosingSoon: 2 }, "STATEMENT_DISPUTE_CLOSING", "3d"],
      [{ linksUsed: 20, maxActiveLinks: 25 }, "PLAN_LIMIT_NEAR", "now"],
    ];
    for (const [facts, id, window] of cases) {
      const r = buildRecommendations({ ...calm, ...facts }).find((x) => x.id === id);
      assert.ok(r, id);
      assert.equal(r!.window, window, id);
    }
  });
  it("thresholds are exact at the edge", () => {
    assert.ok(!ids({ linkVisits30d: THRESHOLDS_V2.linkMinVisits - 1, linkBookings30d: 0 }).includes("LINK_CONVERSION_LOW"));
    assert.ok(ids({ linkVisits30d: THRESHOLDS_V2.linkMinVisits, linkBookings30d: 0 }).includes("LINK_CONVERSION_LOW"));
    assert.ok(!ids({ linkVisits30d: 100, linkBookings30d: 3 }).includes("LINK_CONVERSION_LOW"));
    assert.ok(!ids({ linksUsed: 19, maxActiveLinks: 25 }).includes("PLAN_LIMIT_NEAR"));
    assert.ok(ids({ linksUsed: 20, maxActiveLinks: 25 }).includes("PLAN_LIMIT_NEAR"));
  });
  it("an old caller that passes none of the new facts sees none of the new rules", () => {
    const v2 = new Set(["PROFILE_PHOTO_MISSING", "PROFILE_BIO_INCOMPLETE", "PUBLISH_MORE_SLOTS", "RESPOND_TO_REVIEW", "ADD_LANGUAGE", "VERIFICATION_PENDING", "LINK_CONVERSION_LOW", "LINK_PAUSED_IDLE", "SOCIAL_TEMPLATE_UNUSED", "STATEMENT_DISPUTE_CLOSING", "PLAN_LIMIT_NEAR"]);
    assert.ok(!ids({ activeLinks: 0, widgetEnabled: false, avgProfileCompleteness: 10 }).some((i) => v2.has(i)));
  });
  it("the dispute-window rule is the most urgent", () => assert.equal(buildRecommendations({ ...calm, disputesClosingSoon: 1, doctorsSingleLanguage: 1 })[0]!.id, "STATEMENT_DISPUTE_CLOSING"));
  it("the catalogue is closed: 21 ids, none promises an uplift or pushes extra treatment", () => {
    assert.equal(RECOMMENDATION_IDS.length, 21);
    assert.equal(new Set(RECOMMENDATION_IDS).size, 21);
    for (const id of RECOMMENDATION_IDS) assert.ok(!/UPLIFT|BOOST|MORE_PATIENTS|REVENUE|GROW|DOUBLE/i.test(id), id);
  });
  it("every recommendation param is a number: no free text can reach the card", () => {
    const all = buildRecommendations({ ...calm, doctorsWithoutPhoto: 1, doctorsWithIncompleteBio: 1, doctorsWithFewSlots: 1, unrepliedReviews30d: 1, doctorsSingleLanguage: 1, verificationRequestsPending: 1, linkVisits30d: 100, linkBookings30d: 0, pausedIdleLinks: 1, socialSharedLast30d: 0, disputesClosingSoon: 1, linksUsed: 25, maxActiveLinks: 25 });
    for (const r of all) for (const v of Object.values(r.params)) assert.equal(typeof v, "number");
  });
});

describe("GRW-P2-C recommendation state (dismiss, snooze)", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  it("open by default; dismissed and done stay hidden; snooze hides until its date, then the card returns", () => {
    assert.equal(effectiveState(undefined, now).status, "OPEN");
    assert.equal(effectiveState({ status: "DISMISSED", until: null }, now).status, "DISMISSED");
    assert.equal(effectiveState({ status: "DONE", until: null }, now).status, "DONE");
    assert.equal(effectiveState({ status: "SNOOZED", until: new Date("2026-11-30T00:00:00Z") }, now).status, "SNOOZED");
    assert.equal(effectiveState({ status: "SNOOZED", until: new Date("2026-11-20T00:00:00Z") }, now).status, "OPEN");
    assert.equal(effectiveState({ status: "SNOOZED", until: null }, now).status, "OPEN");
  });
});
