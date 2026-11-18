import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutboxDeliveryService } from "./outbox-delivery.service";

describe("KX-05 outbox delivery envelope", () => {
  const delivery = new OutboxDeliveryService({} as never);

  it("uses stable eventId for receiver dedupe", () => {
    const envelope = delivery.buildEnvelope({
      id: "evt_test_123",
      type: "APPOINTMENT_CONFIRMED",
      aggregateType: "Appointment",
      aggregateId: "appt_1",
      target: "KIOREX",
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      payload: { appointmentId: "appt_1", clinicId: "clinic_1" },
    });
    assert.equal(envelope.eventId, "evt_test_123");
    assert.equal(envelope.type, "APPOINTMENT_CONFIRMED");
    const again = delivery.buildEnvelope({
      id: "evt_test_123",
      type: "APPOINTMENT_CONFIRMED",
      aggregateType: "Appointment",
      aggregateId: "appt_1",
      target: "KIOREX",
      createdAt: new Date("2026-06-01T10:00:00.000Z"),
      payload: { appointmentId: "appt_1", clinicId: "clinic_1" },
    });
    assert.deepEqual(envelope, again);
  });

  it("signatures are deterministic for the same body", () => {
    const body = '{"eventId":"evt_1"}';
    const sigA = delivery.signBody("secret", 1_700_000_000, body);
    const sigB = delivery.signBody("secret", 1_700_000_000, body);
    assert.equal(sigA, sigB);
    assert.notEqual(sigA, delivery.signBody("other", 1_700_000_000, body));
  });
});