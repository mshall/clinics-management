/** Canonical sub-processor ids (SC-01). See Docs/SUB_PROCESSORS_BY_MARKET.md */
export const SC01_SUB_PROCESSOR_IDS = new Set([
  "aws-eu-central-1",
  "openai-eu",
  "whatsapp-bsp",
  "ses-eu",
  "paymob",
]);

export const SC01_SUB_PROCESSOR_LABELS: Record<string, string> = {
  "aws-eu-central-1": "Amazon Web Services (Frankfurt)",
  "openai-eu": "OpenAI (EU API endpoint)",
  "whatsapp-bsp": "WhatsApp business provider",
  "ses-eu": "Amazon SES (EU)",
  paymob: "Paymob (card payments)",
};

/** Market feature flags that activate an external sub-processor when enabled. */
export const FEATURE_FLAG_SUB_PROCESSOR: Record<string, string> = {
  ai_assistant: "openai-eu",
  whatsapp_reminders: "whatsapp-bsp",
  card_payments: "paymob",
};