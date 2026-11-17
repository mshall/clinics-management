export type RxSafetySeverity = "minor" | "moderate" | "major" | "contraindicated" | "info";

export type RxSafetyAlertKind = "allergy" | "interaction" | "duplication" | "unavailable";

export type RxCheckItemInput = {
  drugName: string;
  drugProductId?: string | null;
};

export type RxSafetyAlert = {
  kind: RxSafetyAlertKind;
  severity: RxSafetySeverity;
  messageEn: string;
  messageAr: string;
  requiresOverride: boolean;
  itemIndex?: number;
  relatedItemIndex?: number;
  ruleId?: string;
};

export type RxSafetyCheckResult = {
  alerts: RxSafetyAlert[];
  hasUnverifiedItems: boolean;
};