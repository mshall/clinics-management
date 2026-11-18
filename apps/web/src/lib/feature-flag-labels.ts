import type { TFunction } from "i18next";

/** Maps API feature flag keys to i18n keys under admin.featureFlag.* */
export const FEATURE_FLAG_I18N_KEY: Record<string, string> = {
  ai_assistant: "admin.featureFlag.ai_assistant",
  whatsapp_reminders: "admin.featureFlag.whatsapp_reminders",
  instapay: "admin.featureFlag.instapay",
  fawry: "admin.featureFlag.fawry",
  card_payments: "admin.featureFlag.card_payments",
};

export function featureFlagLabel(t: TFunction, key: string, description: string) {
  const i18nKey = FEATURE_FLAG_I18N_KEY[key];
  return i18nKey ? t(i18nKey, { defaultValue: description }) : description || key;
}