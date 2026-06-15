import type { TFunction } from "i18next";

export const ENCOUNTER_VISIT_TYPES = [
  "Office visit",
  "Follow-up",
  "Consultation",
  "Walk-in",
  "Telehealth",
  "Annual physical",
  "Urgent care",
  "Procedure",
] as const;

const VISIT_TYPE_I18N_KEYS: Record<(typeof ENCOUNTER_VISIT_TYPES)[number], string> = {
  "Office visit": "encounters.visitTypes.office_visit",
  "Follow-up": "encounters.visitTypes.follow_up",
  Consultation: "encounters.visitTypes.consultation",
  "Walk-in": "encounters.visitTypes.walk_in",
  Telehealth: "encounters.visitTypes.telehealth",
  "Annual physical": "encounters.visitTypes.annual_physical",
  "Urgent care": "encounters.visitTypes.urgent_care",
  Procedure: "encounters.visitTypes.procedure",
};

export function formatVisitType(visitType: string, t: TFunction): string {
  const key = VISIT_TYPE_I18N_KEYS[visitType as (typeof ENCOUNTER_VISIT_TYPES)[number]];
  if (!key) return visitType;
  const translated = t(key);
  return translated === key ? visitType : translated;
}
