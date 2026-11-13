/** VAT-inclusive totals: line amounts include VAT at the given percent (e.g. UAE 5%). */
export function computeVatInclusiveBreakdown(totalInclVat: number, vatPercent: number) {
  const rate = vatPercent / 100;
  const safeTotal = Math.max(0, totalInclVat);
  if (rate <= 0) {
    return { subtotalExVat: safeTotal, vatAmount: 0, totalInclVat: safeTotal, vatPercent };
  }
  const subtotalExVat = safeTotal / (1 + rate);
  const vatAmount = safeTotal - subtotalExVat;
  return { subtotalExVat, vatAmount, totalInclVat: safeTotal, vatPercent };
}
