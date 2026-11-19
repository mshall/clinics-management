/**
 * Public surface of the compliance bounded context (FD-02: revenue + consent only).
 */
export { postRevenue, type PostRevenueParams } from "./post-revenue";
export {
  detachRevenueFromEncounter,
  reducePostedRevenueNet,
  voidPostedRevenues,
  voidPostedRevenuesWithFiscalReturns,
  reducePostedRevenueNetWithFiscal,
} from "./void-revenue-adjustments";