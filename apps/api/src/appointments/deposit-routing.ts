import { orderProviders, type RouteCandidate, type RouteDecision } from "@kiorex/pay-contract";

/**
 * Deposit checkout routing on the shared Kiorly Pay contract. The two destinations a deposit link can use today are the clinic's own page ("CLINIC": the patient pays the clinic's own channels and the bank row is matched
 * to the deposit) and Kiorex Pay ("KIOREX_PAY": a hosted checkout). `orderProviders` (its safety floors included) ranks them; nothing here moves money and no fee is ever assumed (a destination with no configured fee
 * is never ranked as cheap). The clinic page is the floor: it needs no external configuration, so a deposit can always be routed, and an organisation can pin it explicitly.
 */
export type DepositDestination = "CLINIC" | "KIOREX_PAY";
export type DepositRoutingInput = {
  /** KIOREX_PAY_LINK_BASE_URL is set (a checkout host exists for this deployment). */
  kiorexPayConfigured: boolean;
  /** Circuit state of Kiorex Pay (false during an outage window). Unknown = available. */
  kiorexPayAvailable?: boolean;
  /** The organisation's own preference, if it set one. */
  orgPreference?: DepositDestination | null;
  /** Observed attempts and successes per destination (optional; small samples are never trusted by the contract). */
  stats?: Partial<Record<DepositDestination, { attempts: number; successes: number }>>;
};
export type DepositRoute = { destination: DepositDestination; decision: RouteDecision; usedFloor: boolean };

export function routeDeposit(i: DepositRoutingInput): DepositRoute {
  const cands: RouteCandidate[] = [
    { psp: "KIOREX_PAY", enabled: i.kiorexPayConfigured, available: i.kiorexPayAvailable, marketRank: 0, orgRank: i.orgPreference === "KIOREX_PAY" ? 0 : i.orgPreference === "CLINIC" ? 1 : undefined, stats: i.stats?.KIOREX_PAY, rails: ["card", "wallet", "instapay"] },
    { psp: "CLINIC", enabled: true, available: true, marketRank: 1, orgRank: i.orgPreference === "CLINIC" ? 0 : i.orgPreference === "KIOREX_PAY" ? 1 : undefined, stats: i.stats?.CLINIC, rails: ["bank_transfer", "instapay", "cash_desk"] },
  ];
  const decision = orderProviders(cands, { strategy: "preference" });
  const first = decision.order[0] as DepositDestination | undefined;
  return first ? { destination: first, decision, usedFloor: false } : { destination: "CLINIC", decision, usedFloor: true };
}
