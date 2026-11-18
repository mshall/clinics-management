import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OUTBOX_LAG_ALERT_MS } from "./outbox-event-types";
import { outboxPendingLagExceedsAlert, outboxPendingLagMs } from "./outbox-lag";

describe("KX-05 outbox lag", () => {
  it("does not alert when queue is empty", () => {
    assert.equal(outboxPendingLagExceedsAlert(null), false);
    assert.equal(outboxPendingLagMs(null), null);
  });

  it("alerts when oldest PENDING exceeds 2 minutes", () => {
    const now = new Date("2026-06-01T12:05:00.000Z");
    const oldest = new Date(now.getTime() - OUTBOX_LAG_ALERT_MS - 1_000);
    assert.equal(outboxPendingLagExceedsAlert(oldest, now), true);
    const lag = outboxPendingLagMs(oldest, now);
    assert.ok(lag != null && lag > OUTBOX_LAG_ALERT_MS);
  });

  it("does not alert inside the 2-minute window", () => {
    const now = new Date("2026-06-01T12:05:00.000Z");
    const oldest = new Date(now.getTime() - 60_000);
    assert.equal(outboxPendingLagExceedsAlert(oldest, now), false);
  });
});