/** True when fee editors entered 0 without the contract (تعاقد) flag. */
export function isZeroCostWithoutContract(input: {
  totalCost: string;
  isContract?: boolean;
  feesOptional?: boolean;
}): boolean {
  if (input.feesOptional) return false;
  if (input.isContract) return false;
  const raw = input.totalCost.trim();
  if (!raw) return false;
  const total = Number.parseFloat(raw);
  return !Number.isNaN(total) && total === 0;
}
