import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BookingSource } from "@prisma/client";
import { isCommissionChargeableBooking, defaultBookingSourceForIntegration } from "./booking-attribution";

describe("CR-02 booking attribution", () => {
  it("CLINIC_LINK bookings are never chargeable regardless of new status", () => {
    assert.equal(isCommissionChargeableBooking(BookingSource.CLINIC_LINK, true), false);
    assert.equal(isCommissionChargeableBooking(BookingSource.CLINIC_LINK, false), false);
    assert.equal(isCommissionChargeableBooking(BookingSource.CLINIC_LINK, null), false);
  });

  it("Kiorex marketplace is chargeable only when new at booking", () => {
    assert.equal(isCommissionChargeableBooking(BookingSource.KIOREX_MARKETPLACE, true), true);
    assert.equal(isCommissionChargeableBooking(BookingSource.KIOREX_MARKETPLACE, false), false);
  });

  it("integration default source mapping", () => {
    assert.equal(
      defaultBookingSourceForIntegration({ marketplaceConsentGranted: true }),
      BookingSource.KIOREX_MARKETPLACE,
    );
    assert.equal(
      defaultBookingSourceForIntegration({ kiorexChannel: "whatsapp" }),
      BookingSource.KIOREX_WHATSAPP,
    );
    assert.equal(defaultBookingSourceForIntegration({}), BookingSource.INTEGRATION);
  });
});