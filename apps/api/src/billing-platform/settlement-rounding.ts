/** Half-up to 2 decimal places (apply once per line). */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * Math.round(abs * 100 + Number.EPSILON) / 100;
}

export function sumRoundedLineAmounts(amounts: number[]): number {
  return roundMoney(amounts.reduce((s, a) => s + roundMoney(a), 0));
}