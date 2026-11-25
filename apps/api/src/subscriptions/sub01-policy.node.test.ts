import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlanKey, SubscriptionStatus } from "@prisma/client";
import {
  computeDowngradeImpact,
  decidePeriodEnd,
  DEFAULT_SUBSCRIPTION_POLICY,
  effectiveAutoRenew,
  liteGraceActive,
  nextOutsideQuietHours,
  reminderOffsetsDue,
  subscriptionPolicyFromFeatureDefaults,
} from "./subscription-policy";

const D = 86_400_000;

describe("SUB-01 policy (pure)", () => {
  it("defaults: auto-renew ON, lapse downgrades to Lite, never lockout", () => {
    const p = subscriptionPolicyFromFeatureDefaults(null);
    assert.equal(p.autoRenewDefault, true);
    assert.equal(p.lapseAction, "DOWNGRADE_TO_LITE");
    assert.deepEqual(p.renewalReminderDaysBefore, [7, 3, 1]);
    assert.deepEqual(p, DEFAULT_SUBSCRIPTION_POLICY);
  });

  it("reads and clamps market-pack values; ignores garbage", () => {
    const p = subscriptionPolicyFromFeatureDefaults({
      kiorlyBilling: { subscription: { autoRenewDefault: false, downgradeAfterDays: 9999, renewalReminderDaysBefore: [1, 14, 14, -3, "x"], lapseAction: "READ_ONLY_SUSPEND", proration: { upgradeTiming: "PERIOD_END" } } },
    });
    assert.equal(p.autoRenewDefault, false);
    assert.equal(p.downgradeAfterDays, 365);
    assert.deepEqual(p.renewalReminderDaysBefore, [14, 1]);
    assert.equal(p.lapseAction, "READ_ONLY_SUSPEND");
    assert.equal(p.proration.upgradeTiming, "PERIOD_END");
    assert.equal(p.proration.downgradeTiming, "PERIOD_END");
  });

  it("platform force beats the org switch", () => {
    assert.equal(effectiveAutoRenew({ autoRenew: false, autoRenewForced: "ON" }), true);
    assert.equal(effectiveAutoRenew({ autoRenew: true, autoRenewForced: "OFF" }), false);
    assert.equal(effectiveAutoRenew({ autoRenew: true, autoRenewForced: null }), true);
  });

  it("period end: renew when on, Lite when off or scheduled cancel, nothing before the end or for non-active states", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const end = new Date("2026-11-30T00:00:00Z");
    const base = { status: SubscriptionStatus.ACTIVE, planKey: PlanKey.PRO, autoRenew: true, cancelAtPeriodEnd: false, currentPeriodEnd: end, now };
    assert.equal(decidePeriodEnd(base), "RENEW");
    assert.equal(decidePeriodEnd({ ...base, autoRenew: false }), "DOWNGRADE_AUTO_RENEW_OFF");
    assert.equal(decidePeriodEnd({ ...base, cancelAtPeriodEnd: true }), "DOWNGRADE_AUTO_RENEW_OFF");
    assert.equal(decidePeriodEnd({ ...base, currentPeriodEnd: new Date(now.getTime() + D) }), "NONE");
    assert.equal(decidePeriodEnd({ ...base, status: SubscriptionStatus.PAST_DUE }), "NONE");
    assert.equal(decidePeriodEnd({ ...base, planKey: PlanKey.LITE, autoRenew: false }), "RENEW");
  });

  it("reminders: one message for the tightest due offset, never twice, none after the end", () => {
    const end = new Date("2026-12-10T12:00:00Z");
    const offsets = [7, 3, 1];
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-01T00:00:00Z"), offsets, alreadySent: [] }), []);
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-04T00:00:00Z"), offsets, alreadySent: [] }), [7]);
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-04T00:00:00Z"), offsets, alreadySent: [7] }), []);
    // after "3 days" went out, "7 days" is superseded, "1 day" still fires later
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-07T00:00:00Z"), offsets, alreadySent: [3] }), []);
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-09T20:00:00Z"), offsets, alreadySent: [3] }), [1]);
    // a tenant that missed runs gets ONE message (the tightest), not three
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-09T20:00:00Z"), offsets, alreadySent: [] }), [1]);
    assert.deepEqual(reminderOffsetsDue({ currentPeriodEnd: end, now: new Date("2026-12-11T00:00:00Z"), offsets, alreadySent: [] }), []);
  });

  it("quiet hours: a reminder due at 23:00 Cairo is deferred to 08:00 Cairo", () => {
    const quiet = { start: 21, end: 8 };
    const now = new Date("2026-12-04T21:00:00Z"); // 23:00 at UTC+2
    const at = nextOutsideQuietHours(now, quiet, 2);
    assert.equal(at.toISOString(), "2026-12-05T06:00:00.000Z"); // 08:00 at UTC+2
    assert.equal(nextOutsideQuietHours(new Date("2026-12-04T10:00:00Z"), quiet, 2).toISOString(), "2026-12-04T10:00:00.000Z");
    assert.equal(nextOutsideQuietHours(now, { start: 5, end: 5 }, 2).toISOString(), now.toISOString());
  });

  it("downgrade impact lists lost features and shrinking limits against usage; data is always retained", () => {
    const impact = computeDowngradeImpact({
      fromPlanKey: PlanKey.PRO,
      toPlanKey: PlanKey.LITE,
      from: { mod_clinical: true, mod_revenue: true, ai_assistant: true, max_clinicians: 10, max_branches: 5 },
      to: { mod_clinical: false, mod_revenue: true, ai_assistant: false, max_clinicians: 2, max_branches: 1 },
      usage: { max_clinicians: 4, max_branches: 1 },
      readOnlyGraceDays: 30,
    });
    assert.deepEqual(impact.lostFeatures, ["ai_assistant", "mod_clinical"]);
    assert.deepEqual(impact.reducedLimits.find((l) => l.key === "max_clinicians"), { key: "max_clinicians", from: 10, to: 2, current: 4, overBy: 2 });
    assert.equal(impact.reducedLimits.find((l) => l.key === "max_branches")?.overBy, 0);
    assert.equal(impact.dataRetained, true);
    assert.equal(impact.readOnlyGraceDays, 30);
  });

  it("lite grace window", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    assert.equal(liteGraceActive({ downgradedToLiteAt: now, liteReadOnlyGraceUntil: new Date(now.getTime() + D) }, now), true);
    assert.equal(liteGraceActive({ downgradedToLiteAt: now, liteReadOnlyGraceUntil: new Date(now.getTime() - D) }, now), false);
    assert.equal(liteGraceActive({ downgradedToLiteAt: null, liteReadOnlyGraceUntil: null }, now), false);
  });
});
