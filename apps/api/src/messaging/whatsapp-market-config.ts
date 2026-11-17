export type WhatsAppTemplateMarketDef = {
  name: string;
  language: string;
  variables?: string[];
  quickReplyButtons?: string[];
  mediaHeader?: boolean;
};

export type WhatsAppMarketConfig = {
  provider?: "meta_cloud" | "http_stub";
  enabled?: boolean;
  phoneNumberId?: string;
  businessDisplayName?: string;
  templates?: Record<string, WhatsAppTemplateMarketDef>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function whatsAppConfigFromMarket(providerConfig: Record<string, unknown> | null | undefined): WhatsAppMarketConfig | null {
  const messaging = asRecord(providerConfig?.messaging);
  const wa = asRecord(messaging.whatsapp);
  if (!Object.keys(wa).length) return null;
  const templatesRaw = asRecord(wa.templates);
  const templates: Record<string, WhatsAppTemplateMarketDef> = {};
  for (const [key, raw] of Object.entries(templatesRaw)) {
    const row = asRecord(raw);
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    templates[key] = {
      name,
      language: String(row.language ?? "en").trim() || "en",
      variables: Array.isArray(row.variables) ? row.variables.map((v) => String(v)) : undefined,
      quickReplyButtons: Array.isArray(row.quickReplyButtons) ? row.quickReplyButtons.map((v) => String(v)) : undefined,
      mediaHeader: row.mediaHeader === true,
    };
  }
  return {
    provider: wa.provider === "http_stub" ? "http_stub" : "meta_cloud",
    enabled: wa.enabled !== false,
    phoneNumberId: typeof wa.phoneNumberId === "string" ? wa.phoneNumberId.trim() : undefined,
    businessDisplayName: typeof wa.businessDisplayName === "string" ? wa.businessDisplayName.trim() : undefined,
    templates,
  };
}

export function resolveMarketTemplate(
  config: WhatsAppMarketConfig | null,
  templateKey: string,
): WhatsAppTemplateMarketDef | null {
  if (!config?.templates) return null;
  return config.templates[templateKey] ?? null;
}