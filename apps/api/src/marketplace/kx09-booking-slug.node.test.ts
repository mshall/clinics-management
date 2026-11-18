import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingSlugCandidates, BOOKING_SLUG_MAX, isValidBookingSlug, slugifyBookingName } from "./booking-slug";

describe("KX-09 booking slugs", () => {
  it("slugifies Latin names and strips accents and punctuation", () => {
    assert.equal(slugifyBookingName("Dr. Ahmed  Élsayed", "doctor"), "dr-ahmed-elsayed");
    assert.equal(slugifyBookingName("Nile Smile — Maadi", "clinic"), "nile-smile-maadi");
  });

  it("falls back for Arabic-only or reserved names", () => {
    assert.equal(slugifyBookingName("عيادة النيل", "clinic"), "clinic");
    assert.equal(slugifyBookingName("Admin", "clinic"), "clinic");
  });

  it("validates format, length and reserved words", () => {
    assert.equal(isValidBookingSlug("dr-ahmed"), true);
    assert.equal(isValidBookingSlug("Dr-Ahmed"), false);
    assert.equal(isValidBookingSlug("dr--ahmed"), false);
    assert.equal(isValidBookingSlug("ab"), false);
    assert.equal(isValidBookingSlug("kiorex"), false);
    assert.equal(isValidBookingSlug("a".repeat(BOOKING_SLUG_MAX + 1)), false);
  });

  it("candidates stay within the max length", () => {
    const base = slugifyBookingName("x".repeat(80), "clinic");
    for (const c of bookingSlugCandidates(base, () => "beef")) {
      assert.ok(isValidBookingSlug(c), c);
    }
  });
});
