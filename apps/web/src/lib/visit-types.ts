import type { TFunction } from "i18next";

/** Canonical visit types offered when creating appointments / encounters. */
export const ENCOUNTER_VISIT_TYPES = [
  "Check-up",
  "Follow-up - Encounter",
  "Follow-up - Operation",
  "Walk-in",
  "Telehealth",
  "Annual physical",
  "Urgent care",
  "Procedure",
] as const;

export type EncounterVisitType = (typeof ENCOUNTER_VISIT_TYPES)[number];

/** Default for new create forms. */
export const DEFAULT_ENCOUNTER_VISIT_TYPE: EncounterVisitType = "Check-up";

const VISIT_TYPE_I18N_KEYS: Record<string, string> = {
  "Check-up": "encounters.visitTypes.check_up",
  "Follow-up - Encounter": "encounters.visitTypes.follow_up_encounter",
  "Follow-up - Operation": "encounters.visitTypes.follow_up_operation",
  "Walk-in": "encounters.visitTypes.walk_in",
  Telehealth: "encounters.visitTypes.telehealth",
  "Annual physical": "encounters.visitTypes.annual_physical",
  "Urgent care": "encounters.visitTypes.urgent_care",
  Procedure: "encounters.visitTypes.procedure",
  // Legacy values still shown on historical records
  "Office visit": "encounters.visitTypes.office_visit",
  "Follow-up": "encounters.visitTypes.follow_up",
  Consultation: "encounters.visitTypes.consultation",
};

export function formatVisitType(visitType: string, t: TFunction): string {
  const key = VISIT_TYPE_I18N_KEYS[visitType];
  if (!key) return visitType;
  const translated = t(key);
  return translated === key ? visitType : translated;
}
