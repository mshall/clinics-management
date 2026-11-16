import { FinancialVisibilityOverride } from "@prisma/client";

export function normalizeMoneyAccessOverride(
  value: FinancialVisibilityOverride,
): FinancialVisibilityOverride {
  if (value === FinancialVisibilityOverride.SHOW) {
    return FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY;
  }
  if (value === FinancialVisibilityOverride.HIDE) {
    return FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT;
  }
  return value;
}

export function moneyVisibilityFromOverride(
  override: FinancialVisibilityOverride,
  roleDefaultVisible: boolean,
): boolean {
  const o = normalizeMoneyAccessOverride(override);
  switch (o) {
    case FinancialVisibilityOverride.SHOW_VISIBILITY_AND_EDIT:
    case FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY:
      return true;
    case FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT:
    case FinancialVisibilityOverride.HIDE_VISIBILITY_ONLY:
      return false;
    case FinancialVisibilityOverride.SHOW_EDIT_ONLY:
    case FinancialVisibilityOverride.HIDE_EDIT_ONLY:
    case FinancialVisibilityOverride.ROLE_DEFAULT:
    default:
      return roleDefaultVisible;
  }
}

export function moneyEditFromOverride(
  override: FinancialVisibilityOverride,
  roleDefaultCanEdit: boolean,
): boolean {
  const o = normalizeMoneyAccessOverride(override);
  switch (o) {
    case FinancialVisibilityOverride.SHOW_VISIBILITY_AND_EDIT:
    case FinancialVisibilityOverride.SHOW_EDIT_ONLY:
      return true;
    case FinancialVisibilityOverride.HIDE_VISIBILITY_AND_EDIT:
    case FinancialVisibilityOverride.HIDE_EDIT_ONLY:
      return false;
    case FinancialVisibilityOverride.SHOW_VISIBILITY_ONLY:
    case FinancialVisibilityOverride.HIDE_VISIBILITY_ONLY:
    case FinancialVisibilityOverride.ROLE_DEFAULT:
    default:
      return roleDefaultCanEdit;
  }
}