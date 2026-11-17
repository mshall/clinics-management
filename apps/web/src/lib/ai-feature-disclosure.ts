/**
 * AI-03 — single source of truth for what is model-backed vs rule-based in product copy.
 * UI and marketing strings in en.json / ar.json must stay aligned (see ai-feature-disclosure.node.test.ts).
 */
export type AiFeatureBacking = "model" | "rule" | "workflow";

export type AiFeatureId =
  | "role_assistant"
  | "pre_visit_summary"
  | "no_show_risk"
  | "chart_scribe";

export type AiFeatureDefinition = {
  id: AiFeatureId;
  backing: AiFeatureBacking;
  /** i18n root under aiFeatures.{id} */
  titleKey: string;
  disclosureKey: string;
  showsAiBadge: boolean;
};

export const AI_FEATURES: Record<AiFeatureId, AiFeatureDefinition> = {
  role_assistant: {
    id: "role_assistant",
    backing: "model",
    titleKey: "aiFeatures.roleAssistant.title",
    disclosureKey: "aiFeatures.roleAssistant.disclosure",
    showsAiBadge: true,
  },
  pre_visit_summary: {
    id: "pre_visit_summary",
    backing: "rule",
    titleKey: "aiFeatures.preVisitSummary.title",
    disclosureKey: "aiFeatures.preVisitSummary.disclosure",
    showsAiBadge: false,
  },
  no_show_risk: {
    id: "no_show_risk",
    backing: "rule",
    titleKey: "aiFeatures.noShowRisk.title",
    disclosureKey: "aiFeatures.noShowRisk.disclosure",
    showsAiBadge: false,
  },
  chart_scribe: {
    id: "chart_scribe",
    backing: "workflow",
    titleKey: "aiFeatures.chartScribe.title",
    disclosureKey: "aiFeatures.chartScribe.disclosure",
    showsAiBadge: false,
  },
};

/** English guide copy mirrors aiFeatures — kept here for static guide tests. */
export const GUIDE_HONEST_AI_EN = {
  preVisitTitle: "Smart summary (pre-visit)",
  preVisitBody:
    "Open the smart summary on the patient chart or use Patient 360: last visits, meds, allergies, and alerts — assembled from your records, not a language model.",
  scribeTitle: "Chart scribe (workflow)",
  scribeBody:
    "Start a scribe session on an encounter, review the draft note and Rx, then approve into the chart. Speech-to-text and generative drafting require a production provider.",
  noShowRiskBody:
    "Create and reschedule appointments; use the no-show risk estimate (formula from history and booking lead time) to decide on reminders or deposit policy.",
} as const;