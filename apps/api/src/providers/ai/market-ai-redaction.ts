export type MarketAiRedaction = {
  namePattern?: string;
  nationalIdPattern?: string;
  phonePattern?: string;
  emailPattern?: string;
};

const EGYPT_DEFAULT: MarketAiRedaction = {
  namePattern: "(?:\\b[\\u0600-\\u06FF]{2,}(?:\\s+[\\u0600-\\u06FF]{2,}){1,4}\\b)|(?:\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3}\\b)",
  nationalIdPattern: "\\b(?:\\+?20|0)?1[0125]\\d{8}\\b|\\b\\d{14}\\b",
  phonePattern: "\\b(?:\\+?20|0)?1[0125]\\d{8}\\b",
  emailPattern: "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b",
};

const UAE_DEFAULT: MarketAiRedaction = {
  namePattern: "(?:\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3}\\b)",
  nationalIdPattern: "\\b784-[0-9]{4}-[0-9]{7}-[0-9]\\b",
  phonePattern: "\\b(?:\\+?971|0)?5[0-9]{8}\\b",
  emailPattern: EGYPT_DEFAULT.emailPattern,
};

export function redactionForMarket(
  marketCode: string | null | undefined,
  providerConfig: Record<string, unknown> | null | undefined,
): MarketAiRedaction {
  const fromPack = parseRedactionFromProviderConfig(providerConfig);
  if (fromPack) return { ...defaultsForMarket(marketCode), ...fromPack };
  return defaultsForMarket(marketCode);
}

function defaultsForMarket(marketCode: string | null | undefined): MarketAiRedaction {
  const code = marketCode?.trim().toUpperCase();
  if (code === "AE") return { ...UAE_DEFAULT };
  return { ...EGYPT_DEFAULT };
}

function parseRedactionFromProviderConfig(
  providerConfig: Record<string, unknown> | null | undefined,
): Partial<MarketAiRedaction> | null {
  if (!providerConfig || typeof providerConfig !== "object") return null;
  const ai = providerConfig.ai;
  if (!ai || typeof ai !== "object" || Array.isArray(ai)) return null;
  const r = (ai as Record<string, unknown>).redaction;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const out: Partial<MarketAiRedaction> = {};
  if (typeof o.namePattern === "string") out.namePattern = o.namePattern;
  if (typeof o.nationalIdPattern === "string") out.nationalIdPattern = o.nationalIdPattern;
  if (typeof o.phonePattern === "string") out.phonePattern = o.phonePattern;
  if (typeof o.emailPattern === "string") out.emailPattern = o.emailPattern;
  return Object.keys(out).length ? out : null;
}