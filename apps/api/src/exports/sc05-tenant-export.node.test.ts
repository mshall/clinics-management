import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubscriptionStatus } from "@prisma/client";
import {
  SubscriptionAccessAction,
  subscriptionAllowsAction,
} from "../subscriptions/subscription-access-policy";
import type { JwtUser } from "../auth/jwt-user";

describe("SC-05 tenant export policy", () => {
  it("export works in SUSPENDED state for the owner", () => {
    const owner = {
      userId: "u1",
      tenantId: "t1",
      email: "o@x.com",
      role: "GROUP_ADMIN",
      isTenantOwner: true,
    } as JwtUser;
    assert.equal(
      subscriptionAllowsAction(SubscriptionStatus.SUSPENDED, SubscriptionAccessAction.EXPORT, owner),
      true,
    );
    const staff = {
      userId: "u2",
      tenantId: "t1",
      email: "s@x.com",
      role: "RECEPTIONIST",
      isTenantOwner: false,
    } as JwtUser;
    assert.equal(
      subscriptionAllowsAction(SubscriptionStatus.SUSPENDED, SubscriptionAccessAction.EXPORT, staff),
      false,
    );
  });
});
