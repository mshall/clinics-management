import { type PaymentMethod, type Prisma } from "@prisma/client";
import { roundMoney, signedMovement } from "./patient-money";

export const SHIFT_STATUS = { OPEN: "OPEN", CLOSED: "CLOSED" } as const;

/** INTERNAL outbox topic consumed by engagement (owner shift summary). */
export const SHIFT_CLOSED_TOPIC = "billing.shift_closed";

const DEFAULT_SHIFT_VARIANCE_REVIEW_THRESHOLD = 50;

/** Market pack `providerConfig.billing.shiftVarianceReviewThreshold` (major units); a larger cash or card variance flags the shift. */
export function shiftVarianceReviewThreshold(providerConfig: unknown): number {
  const raw = (providerConfig as { billing?: { shiftVarianceReviewThreshold?: unknown } } | null)?.billing
    ?.shiftVarianceReviewThreshold;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SHIFT_VARIANCE_REVIEW_THRESHOLD;
}

export type DrawerTotals = {
  /** Payment allocations per method (excluding deposits converted at check-in — their cash entered at deposit time). */
  paymentsByMethod: Partial<Record<PaymentMethod, number>>;
  /** Signed non-payment drawer movements (deposits, refunds, package sales…) per source type, all methods. */
  movementsBySource: Record<string, number>;
  paymentCount: number;
  cashIn: number;
  cashOut: number;
  /** Net cash taken during the window (no float). */
  netCash: number;
  netCard: number;
};

export function summarizeDrawer(
  allocations: { method: PaymentMethod; amount: number }[],
  movements: { direction: string; method: PaymentMethod; amount: number; sourceType: string }[],
  paymentCount: number,
): DrawerTotals {
  const paymentsByMethod: Partial<Record<PaymentMethod, number>> = {};
  let cashIn = 0;
  let cashOut = 0;
  let netCard = 0;
  for (const a of allocations) {
    paymentsByMethod[a.method] = roundMoney((paymentsByMethod[a.method] ?? 0) + a.amount);
    if (a.method === "CASH") {
      if (a.amount >= 0) cashIn += a.amount;
      else cashOut -= a.amount;
    } else if (a.method === "CARD") netCard += a.amount;
  }
  const movementsBySource: Record<string, number> = {};
  for (const m of movements) {
    const signed = signedMovement(m.direction, m.amount);
    movementsBySource[m.sourceType] = roundMoney((movementsBySource[m.sourceType] ?? 0) + signed);
    if (m.method === "CASH") {
      if (signed >= 0) cashIn += signed;
      else cashOut -= signed;
    } else if (m.method === "CARD") netCard += signed;
  }
  return {
    paymentsByMethod,
    movementsBySource,
    paymentCount,
    cashIn: roundMoney(cashIn),
    cashOut: roundMoney(cashOut),
    netCash: roundMoney(cashIn - cashOut),
    netCard: roundMoney(netCard),
  };
}

export type ShiftCloseOutcome = {
  expectedCash: number;
  expectedCard: number;
  cashVariance: number;
  cardVariance: number;
  hasVariance: boolean;
  needsReview: boolean;
};

/** Counted − expected. Any variance needs a note; above the threshold the shift is flagged for owner review. */
export function shiftCloseOutcome(input: {
  openingFloat: number;
  totals: Pick<DrawerTotals, "netCash" | "netCard">;
  countedCash: number;
  countedCard: number;
  threshold: number;
}): ShiftCloseOutcome {
  const expectedCash = roundMoney(input.openingFloat + input.totals.netCash);
  const expectedCard = roundMoney(input.totals.netCard);
  const cashVariance = roundMoney(input.countedCash - expectedCash);
  const cardVariance = roundMoney(input.countedCard - expectedCard);
  const hasVariance = Math.abs(cashVariance) >= 0.01 || Math.abs(cardVariance) >= 0.01;
  const needsReview = Math.abs(cashVariance) > input.threshold || Math.abs(cardVariance) > input.threshold;
  return { expectedCash, expectedCard, cashVariance, cardVariance, hasVariance, needsReview };
}

export function shiftSummaryJson(totals: DrawerTotals): Prisma.InputJsonValue {
  return totals as unknown as Prisma.InputJsonValue;
}
