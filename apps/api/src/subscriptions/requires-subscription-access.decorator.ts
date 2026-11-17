import { SetMetadata } from "@nestjs/common";
import type { SubscriptionAccessAction } from "./subscription-access-policy";

export const REQUIRES_SUBSCRIPTION_ACCESS_KEY = "requiresSubscriptionAccess";

export const RequiresSubscriptionAccess = (action: SubscriptionAccessAction) =>
  SetMetadata(REQUIRES_SUBSCRIPTION_ACCESS_KEY, action);