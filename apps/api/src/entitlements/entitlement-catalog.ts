import { PlanKey } from "@prisma/client";
import {
  ENTITLEMENT_MIN_PLAN,
  PLAN_GATED_FEATURE_FLAGS,
  type ModuleEntitlementKey,
} from "./plans-matrix";

export { ENTITLEMENT_MIN_PLAN, PLAN_GATED_FEATURE_FLAGS };

export const KNOWN_LIMIT_KEYS = ["max_clinicians", "max_branches", "max_assistant_seats"] as const;
export type LimitEntitlementKey = (typeof KNOWN_LIMIT_KEYS)[number];

export type CatalogEntitlementKey = ModuleEntitlementKey;

export { PlanKey };