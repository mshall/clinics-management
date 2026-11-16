export type MoneyAccessOverride =
  | "ROLE_DEFAULT"
  | "SHOW_VISIBILITY_AND_EDIT"
  | "SHOW_VISIBILITY_ONLY"
  | "SHOW_EDIT_ONLY"
  | "HIDE_VISIBILITY_AND_EDIT"
  | "HIDE_VISIBILITY_ONLY"
  | "HIDE_EDIT_ONLY";

/** @deprecated legacy API values */
type LegacyMoneyAccessOverride = MoneyAccessOverride | "SHOW" | "HIDE";

export function normalizeMoneyAccessOverride(value: LegacyMoneyAccessOverride): MoneyAccessOverride {
  if (value === "SHOW") return "SHOW_VISIBILITY_ONLY";
  if (value === "HIDE") return "HIDE_VISIBILITY_AND_EDIT";
  return value;
}

export function moneyVisibilityFromOverride(override: LegacyMoneyAccessOverride, roleDefaultVisible: boolean): boolean {
  const o = normalizeMoneyAccessOverride(override);
  switch (o) {
    case "SHOW_VISIBILITY_AND_EDIT":
    case "SHOW_VISIBILITY_ONLY":
      return true;
    case "HIDE_VISIBILITY_AND_EDIT":
    case "HIDE_VISIBILITY_ONLY":
      return false;
    default:
      return roleDefaultVisible;
  }
}

export function moneyEditFromOverride(override: LegacyMoneyAccessOverride, roleDefaultCanEdit: boolean): boolean {
  const o = normalizeMoneyAccessOverride(override);
  switch (o) {
    case "SHOW_VISIBILITY_AND_EDIT":
    case "SHOW_EDIT_ONLY":
      return true;
    case "HIDE_VISIBILITY_AND_EDIT":
    case "HIDE_EDIT_ONLY":
      return false;
    default:
      return roleDefaultCanEdit;
  }
}

export const MONEY_ACCESS_OVERRIDE_OPTIONS: MoneyAccessOverride[] = [
  "ROLE_DEFAULT",
  "SHOW_VISIBILITY_AND_EDIT",
  "SHOW_VISIBILITY_ONLY",
  "SHOW_EDIT_ONLY",
  "HIDE_VISIBILITY_AND_EDIT",
  "HIDE_VISIBILITY_ONLY",
  "HIDE_EDIT_ONLY",
];

export const MONEY_ACCESS_OVERRIDE_I18N: Record<MoneyAccessOverride, string> = {
  ROLE_DEFAULT: "admin.moneyAccessRoleDefault",
  SHOW_VISIBILITY_AND_EDIT: "admin.moneyAccessShowVisibilityAndEdit",
  SHOW_VISIBILITY_ONLY: "admin.moneyAccessShowVisibilityOnly",
  SHOW_EDIT_ONLY: "admin.moneyAccessShowEditOnly",
  HIDE_VISIBILITY_AND_EDIT: "admin.moneyAccessHideVisibilityAndEdit",
  HIDE_VISIBILITY_ONLY: "admin.moneyAccessHideVisibilityOnly",
  HIDE_EDIT_ONLY: "admin.moneyAccessHideEditOnly",
};