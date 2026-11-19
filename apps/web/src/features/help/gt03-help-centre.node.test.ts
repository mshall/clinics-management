import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELP_ARTICLES,
  TOP_SUPPORT_QUESTION_IDS,
  articlesForTier,
  searchHelpArticles,
} from "./help-articles";
import { HELP_VIDEOS } from "./help-content";

describe("GT-03 help centre & Arabic video tutorials", () => {
  it("answers the top 20 support questions with bilingual articles", () => {
    assert.equal(HELP_ARTICLES.length, 20);
    assert.equal(TOP_SUPPORT_QUESTION_IDS.length, 20);
    const ids = new Set(HELP_ARTICLES.map((a) => a.questionId));
    assert.equal(ids.size, 20);
    for (const a of HELP_ARTICLES) {
      assert.ok(a.titleEn.trim().length > 8, a.id);
      assert.ok(a.titleAr.trim().length > 4, a.id);
      assert.ok(a.bodyEn.trim().length > 40, a.id);
      assert.ok(a.bodyAr.trim().length > 20, a.id);
      assert.ok(a.tiers.length >= 1, a.id);
      assert.match(a.questionId, /^q\d{2}-/);
    }
  });

  it("filters task articles by plan tier", () => {
    const lite = articlesForTier("LITE");
    assert.ok(lite.every((a) => a.tiers.includes("ALL") || a.tiers.includes("LITE")));
    assert.ok(lite.some((a) => a.id === "signup-trial"));
    assert.ok(!lite.some((a) => a.id === "ai-scribe"));
    const clinic = articlesForTier("CLINIC");
    assert.ok(clinic.some((a) => a.id === "ai-scribe"));
    assert.ok(clinic.some((a) => a.id === "doctor-share"));
  });

  it("searches titles, bodies and tags in EN and AR", () => {
    const deposit = searchHelpArticles("deposit no-show");
    assert.ok(deposit.some((a) => a.id === "no-show-deposit"));
    const ar = searchHelpArticles("عربون", { locale: "ar" });
    assert.ok(ar.some((a) => a.id === "no-show-deposit"));
    const empty = searchHelpArticles("zzzz-not-a-real-topic");
    assert.equal(empty.length, 0);
  });

  it("links golden-flow Arabic videos from HELP_VIDEOS", () => {
    assert.equal(HELP_VIDEOS.length, 5);
    const withVideo = HELP_ARTICLES.filter((a) => a.videoId);
    assert.ok(withVideo.length >= 5);
    for (const a of withVideo) {
      assert.ok(HELP_VIDEOS.includes(a.videoId!));
    }
  });
});
