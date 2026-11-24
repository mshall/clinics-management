import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AcquisitionOrigin, BookingSource } from "@prisma/client";
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

  it("GRW-P1-D2 matrix: source x newPatient x origin. PROVIDER_LED is never chargeable; an absent origin equals today's behaviour", () => {
    const sources = Object.values(BookingSource);
    const origins: Array<AcquisitionOrigin | null | undefined> = [undefined, null, AcquisitionOrigin.UNATTRIBUTED, AcquisitionOrigin.MARKETPLACE, AcquisitionOrigin.PROVIDER_LED];
    let chargeable = 0;
    for (const source of sources) {
      for (const isNew of [true, false, null, undefined]) {
        const today = isCommissionChargeableBooking(source, isNew);
        for (const origin of origins) {
          const now = isCommissionChargeableBooking(source, isNew, origin);
          if (origin === AcquisitionOrigin.PROVIDER_LED) assert.equal(now, false, `${source}/${isNew}/PROVIDER_LED`);
          else assert.equal(now, today, `${source}/${isNew}/${origin} must equal today's rule`);
          // evidence can only REMOVE a fee: whatever the origin, the new function never charges where today's does not
          if (now) assert.equal(today, true);
          if (origin === undefined && today) chargeable += 1;
        }
      }
    }
    assert.equal(chargeable, 3, "exactly KIOREX_MARKETPLACE, KIOREX_WHATSAPP and INTEGRATION with a new patient are chargeable today");
  });
});
