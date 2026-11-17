import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionStatus, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { DEFAULT_DUNNING_TIMELINE, dunningTimelineFromFeatureDefaults } from "./dunning-config";
import { daysAfterDue, subscriptionStatusForDaysOverdue } from "./dunning-timeline";
import {
  subscriptionAllowsAction,
  SubscriptionAccessAction,
} from "./subscription-access-policy";

describe("SB-03 dunning timeline", () => {
  const config = { ...DEFAULT_DUNNING_TIMELINE, reminderDaysBeforeDue: [...DEFAULT_DUNNING_TIMELINE.reminderDaysBeforeDue] };

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