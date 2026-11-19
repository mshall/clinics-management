import type { PlanUpgradePayload } from "@/lib/plan-upgrade-payload";
import { apiPost } from "@/lib/http";

export type PaywallEventType = "view" | "conversion_intent";

export function trackPaywallEvent(type: PaywallEventType, payload: PlanUpgradePayload, source?: string): void {
  void apiPost("/api/v1/billing/paywall-events", {
    type,
    entitlement: payload.entitlement,
    requiredPlan: payload.requiredPlan,
    source: source ?? null,
  }).catch(() => {
    /* non-blocking */
  });
}