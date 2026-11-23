import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentStatus } from "@prisma/client";
import { FrontDeskService } from "./front-desk.service";

/** Kiorly Team replays queued writes and users double-tap: a second check-in must return the same ticket and must not post the payment / commission / ticket again. */
describe("front desk check-in is idempotent", () => {
  const checkedInAt = new Date("2026-11-21T09:00:00.000Z");
  const apt = { id: "a1", tenantId: "t1", clinicId: "c1", patientId: "p1", clinicianId: "u1", status: AppointmentStatus.CHECKED_IN, queueTicketNumber: 7, checkedInAt, checkInPaymentAmount: 450, patient: { mrn: "MRN-1" }, clinic: {} };
  // every dependency except these reads is missing on purpose: any attempt to issue a ticket, capture consent or post revenue would throw
  const svc = Object.assign(Object.create(FrontDeskService.prototype), {
    prisma: {
      appointment: { findFirst: async () => apt },
      encounter: { findFirst: async () => ({ id: "enc1" }) },
      user: { findUnique: async () => ({ displayName: "Dr Nadia" }) },
      $transaction: async () => { throw new Error("must not open a transaction on a replay"); },
    },
  }) as FrontDeskService;
  it("returns the existing ticket, payment and draft encounter", async () => {
    const r = await svc.checkIn("t1", { userId: "u9", tenantId: "t1" } as never, "a1", { paymentAmount: 450 });
    assert.deepEqual(r, { appointmentId: "a1", queueTicketNumber: 7, checkedInAt: checkedInAt.toISOString(), status: "CHECKED_IN", patientMrn: "MRN-1", clinicianName: "Dr Nadia", paymentRecorded: 450, openEncounterId: "enc1" });
  });
});
