// Single rule for every country/market selector (founder decision, 23 Nov 2026): Egypt is the only launch market,
// so a selector is shown only when MORE THAN ONE market is live. With one market the value is fixed (EG, phone +20,
// EGP). The API stays multi-market; only the UI choice is hidden.
export type LiveMarket = { code: string };

export const FALLBACK_MARKET_CODE = "EG";

export function shouldShowMarketSelector(markets: readonly LiveMarket[] | null | undefined): boolean {
  return (markets?.length ?? 0) > 1;
}

/** The market used when the selector is hidden: the only live market, else Egypt. */
export function fixedMarketCode(markets: readonly LiveMarket[] | null | undefined): string {
  return markets?.length === 1 ? markets[0]!.code.toUpperCase() : FALLBACK_MARKET_CODE;
}

const DIAL: Record<string, string> = { EG: "+20" };
export const dialCodeFor = (code: string): string => DIAL[code.toUpperCase()] ?? "";
