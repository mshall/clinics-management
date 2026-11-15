export type MarketAiPackConfig = {
  key?: string;
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  secretRef?: string | null;
  promptVersion?: string;
};

export function parseMarketAiConfig(providerConfig: unknown): MarketAiPackConfig | null {
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) return null;
  const ai = (providerConfig as Record<string, unknown>).ai;
  if (!ai || typeof ai !== "object" || Array.isArray(ai)) return null;
  const o = ai as Record<string, unknown>;
  return {
    key: typeof o.key === "string" ? o.key.trim() : undefined,
    enabled: typeof o.enabled === "boolean" ? o.enabled : undefined,
    baseUrl: typeof o.baseUrl === "string" ? o.baseUrl.trim() : undefined,
    model: typeof o.model === "string" ? o.model.trim() : undefined,
    secretRef: typeof o.secretRef === "string" ? o.secretRef.trim() : o.secretRef === null ? null : undefined,
    promptVersion: typeof o.promptVersion === "string" ? o.promptVersion.trim() : undefined,
  };
}