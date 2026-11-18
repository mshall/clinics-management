import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus, BookingSource } from "@prisma/client";
import { isReviewInvitationEligible } from "../messaging/review-invitation";
import { weightedKiorexRating } from "./kiorex-rating";

describe("KX-08 verified review invitations", () => {
  it("invites only after a completed Kiorex visit", () => {
    for (const source of [BookingSource.KIOREX_MARKETPLACE, BookingSource.KIOREX_WHATSAPP, BookingSource.CLINIC_LINK]) {
      assert.equal(isReviewInvitationEligible(AppointmentStatus.COMPLETED, source), true);
    }
  });

  it("never invites for no-shows, cancellations or other statuses", () => {
    for (const status of [
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.CONFIRMED,
    ]) {
      assert.equal(isReviewInvitationEligible(status, BookingSource.KIOREX_MARKETPLACE), false);
    }
  });

  it("never invites for bookings that did not come through Kiorex", () => {
    for (const source of [BookingSource.FRONT_DESK, BookingSource.PHONE, BookingSource.WALK_IN, BookingSource.IMPORT]) {
      assert.equal(isReviewInvitationEligible(AppointmentStatus.COMPLETED, source), false);
    }
  });

  it("weights the doctor score by review count", () => {
    assert.deepEqual(weightedKiorexRating([]), { averageRating: null, reviewCount: 0 });
    assert.deepEqual(
      weightedKiorexRating([
        { averageRating: 5, reviewCount: 3 },
        { averageRating: 3, reviewCount: 1 },
      ]),
      { averageRating: 4.5, reviewCount: 4 },
    );
  });
});
