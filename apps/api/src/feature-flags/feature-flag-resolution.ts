/**
 * FF02 — pure flag resolution (KX-08 §08 "How the effective value is computed").
 *
 * 1. Global     — default ON
 * 2. Market     — inherit / OFF
 * 3. Organization — inherit / OFF
 * 4. Plan entitlement — not entitled ⇒ OFF (HTTP 402 is raised by EntitlementGuard, not by flag guards)
 * 5. Gate evidence — launch-locked flags are OFF until `gateSatisfied`
 * 6. Dependencies — every parent flag must be effective
 * 7. Effective — ON / OFF
 *
 * Any OFF wins: a lower scope can never re-enable what a higher scope turned off. Explicit ON at a lower scope
 * is equivalent to inherit.
 */
import type { FlagScopeName } from "./feature-flag-keys";

export type FlagValue = "ON" | "OFF" | null;

export type FlagBlockedBy = FlagScopeName | "plan" | "gate" | "dependency";

export type FlagResolutionInput = {
  globalValue: FlagValue;
  marketValue: FlagValue;
  orgValue: FlagValue;
  planEntitled: boolean;
  launchLocked: boolean;
  gateSatisfied: boolean;
  /** Resolved parents (own result), in `dependsOn` order. */
  parents: ReadonlyArray<{ key: string; effective: boolean; blockedBy?: FlagBlockedBy; scope?: FlagScopeName }>;
};

export type FlagResolution = {
  effective: boolean;
  /** Which rule decided. `default` means every scope inherited ON. */
  source: FlagBlockedBy | "default" | "market-on" | "org-on";
  /** Scope reported in FEATURE_DISABLED {key, scope}. Undefined when effective. */
  scope?: FlagScopeName;
  /** When blocked by a dependency, the first failing parent key. */
  blockedParent?: string;
};

export function resolveFlag(input: FlagResolutionInput): FlagResolution {
  // Rule 1
  if (input.globalValue === "OFF") return { effective: false, source: "global", scope: "global" };
  // Rule 2
  if (input.marketValue === "OFF") return { effective: false, source: "market", scope: "market" };
  // Rule 3
  if (input.orgValue === "OFF") return { effective: false, source: "org", scope: "org" };
  // Rule 4
  if (!input.planEntitled) return { effective: false, source: "plan", scope: "global" };
  // Rule 5
  if (input.launchLocked && !input.gateSatisfied) return { effective: false, source: "gate", scope: "global" };
  // Rule 6
  const failing = input.parents.find((p) => !p.effective);
  if (failing) {
    return { effective: false, source: "dependency", scope: failing.scope ?? "global", blockedParent: failing.key };
  }
  // Rule 7
  if (input.orgValue === "ON") return { effective: true, source: "org-on" };
  if (input.marketValue === "ON") return { effective: true, source: "market-on" };
  return { effective: true, source: "default" };
}
