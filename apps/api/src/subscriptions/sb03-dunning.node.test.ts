import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { DEFAULT_DUNNING_TIMELINE, dunningTimelineFromFeatureDefaults } from "./dunning-config";
import { daysAfterDue, dueReminderOffsets, subscriptionStatusForDaysOverdue } from "./dunning-timeline";
import { commercialConfigToFeatureDefaultsPatch, commercialConfigFromFeatureDefaults } from "../markets/commercial-config.bridge";
import { DEFAULT_COMMERCIAL_CONFIG } from "../markets/commercial-config.schema";
import { DEFAULT_SUBSCRIPTION_POLICY } from "./subscription-policy";
import {
  subscriptionAllowsAction,
  SubscriptionAccessAction,
} from "./subscription-access-policy";

describe("SB-03 dunning timeline", () => {
  const config = { ...DEFAULT_DUNNING_TIMELINE, reminderDaysBeforeDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysBeforeDue], reminderDaysAfterDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysAfterDue] };

  it("defaults are unchanged: reminders 3 and 0 days before due, none after", () => {
    const d = dunningTimelineFromFeatureDefaults(null);
    assert.deepEqual(d.reminderDaysBeforeDue, [3, 0]);
    assert.deepEqual(d.reminderDaysAfterDue, []);
    assert.deepEqual(DEFAULT_SUBSCRIPTION_POLICY.renewalReminderDaysBefore, [7, 3, 1]);
    const patch = commercialConfigToFeatureDefaultsPatch(DEFAULT_COMMERCIAL_CONFIG) as { kiorlyBilling: { dunning: Record<string, unknown> } };
    assert.deepEqual(patch.kiorlyBilling.dunning.reminderDaysBeforeDue, [3, 0]);
    assert.deepEqual(patch.kiorlyBilling.dunning.reminderDaysAfterDue, []);
    assert.equal(patch.kiorlyBilling.dunning.pastDueFromDay, 1);
  });

  it("reminders come from the market pack (before and after the due date) and round trip through the bridge", () => {
    const cfg = structuredClone(DEFAULT_COMMERCIAL_CONFIG);
    cfg.dunning.reminderDaysBeforeDue = [5, 1];
    cfg.dunning.reminderDaysAfterDue = [2, 7];
    const patch = commercialConfigToFeatureDefaultsPatch(cfg);
    const t = dunningTimelineFromFeatureDefaults(patch);
    assert.deepEqual(t.reminderDaysBeforeDue, [5, 1]);
    assert.deepEqual(t.reminderDaysAfterDue, [2, 7]);
    const back = commercialConfigFromFeatureDefaults(patch);
    assert.deepEqual(back.dunning.reminderDaysAfterDue, [2, 7]);
    // after-due offsets below 1 are rejected
    assert.deepEqual(dunningTimelineFromFeatureDefaults({ kiorlyBilling: { dunning: { reminderDaysAfterDue: [0, -1, 3] } } }).reminderDaysAfterDue, [3]);
  });

  it("dueReminderOffsets fires before-due and after-due reminders on the right day only", () => {
    const due = new Date("2027-04-10T12:00:00Z");
    const cfg = { reminderDaysBeforeDue: [3, 0], reminderDaysAfterDue: [2] };
    assert.deepEqual(dueReminderOffsets(cfg, due, new Date("2027-04-07T08:00:00Z")).map((r) => r.key), ["dunning_reminder_d3"]);
    assert.deepEqual(dueReminderOffsets(cfg, due, new Date("2027-04-10T08:00:00Z")).map((r) => r.key), ["dunning_reminder_d0"]);
    assert.deepEqual(dueReminderOffsets(cfg, due, new Date("2027-04-12T08:00:00Z")).map((r) => r.key), ["dunning_reminder_after_d2"]);
    assert.deepEqual(dueReminderOffsets(cfg, due, new Date("2027-04-11T08:00:00Z")), []);
    assert.deepEqual(dueReminderOffsets({ reminderDaysBeforeDue: [3, 0], reminderDaysAfterDue: [] }, due, new Date("2027-04-12T08:00:00Z")), []);
  });

  it("maps days overdue to subscription statuses from market config", () => {
    assert.equal(subscriptionStatusForDaysOverdue(0, config), SubscriptionStatus.ACTIVE);
    assert.equal(subscriptionStatusForDaysOverdue(1, config), SubscriptionStatus.PAST_DUE);
    assert.equal(subscriptionStatusForDaysOverdue(2, config), SubscriptionStatus.GRACE);
    assert.equal(subscriptionStatusForDaysOverdue(14, config), SubscriptionStatus.GRACE);
    assert.equal(subscriptionStatusForDaysOverdue(15, config), SubscriptionStatus.READ_ONLY);
    assert.equal(subscriptionStatusForDaysOverdue(44, config), SubscriptionStatus.READ_ONLY);
    assert.equal(subscriptionStatusForDaysOverdue(45, config), SubscriptionStatus.SUSPENDED);
  });

  it("reads custom pack from featureDefaults.kiorlyBilling.dunning", () => {
    const custom = dunningTimelineFromFeatureDefaults({
      kiorlyBilling: {
        dunning: {
          pastDueFromDay: 2,
          graceEndDay: 10,
          readOnlyFromDay: 11,
          suspendedFromDay: 30,
        },
      },
    });
    assert.equal(subscriptionStatusForDaysOverdue(1, custom), SubscriptionStatus.ACTIVE);
    assert.equal(subscriptionStatusForDaysOverdue(11, custom), SubscriptionStatus.READ_ONLY);
    assert.equal(subscriptionStatusForDaysOverdue(30, custom), SubscriptionStatus.SUSPENDED);
  });

  it("computes whole days after due in UTC", () => {
    const due = new Date("2027-04-07T23:59:00Z");
    const next = new Date("2027-04-08T01:00:00Z");
    assert.equal(daysAfterDue(due, next), 1);
  });
});

describe("SB-03 subscription access policy", () => {
  it("READ_ONLY allows read/export but blocks scheduling", () => {
    assert.equal(
      subscriptionAllowsAction(SubscriptionStatus.READ_ONLY, SubscriptionAccessAction.READ, null),
      true,
    );
    assert.equal(
      subscriptionAllowsAction(SubscriptionStatus.READ_ONLY, SubscriptionAccessAction.EXPORT, null),
      true,
    );
    assert.equal(
      subscriptionAllowsAction(SubscriptionStatus.READ_ONLY, SubscriptionAccessAction.SCHEDULING_WRITE, null),
      false,
    );
  });

  it("SUSPENDED allows owner billing and export only", () => {
    const owner = {
      userId: "u1",
      tenantId: "t1",
      email: "o@test",
      isTenantOwner: true,
      role: UserRole.GROUP_ADMIN,
    } as JwtUser;
    const staff = {
      userId: "u2",
      tenantId: "t1",
      email: "s@test",
      isTenantOwner: false,
      role: UserRole.PHYSICIAN,
    } as JwtUser;
    assert.equal(subscriptionAllowsAction(SubscriptionStatus.SUSPENDED, SubscriptionAccessAction.BILLING, owner), true);
    assert.equal(subscriptionAllowsAction(SubscriptionStatus.SUSPENDED, SubscriptionAccessAction.EXPORT, owner), true);
    assert.equal(subscriptionAllowsAction(SubscriptionStatus.SUSPENDED, SubscriptionAccessAction.READ, staff), false);
  });
});