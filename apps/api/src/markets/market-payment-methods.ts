export type MarketPaymentMethodDef = {
  key: string;
  labelKey?: string;
  /** When set, this method maps to a money-transfer channel id (market-defined, not a global enum). */
  transferChannel?: string;
  /** ECMAScript regex (string) for transfer reference validation */
  referencePattern?: string;
  /** Env var name for optional online verification URL (e.g. INSTAPAY_VERIFY_URL) */
  verifyUrlEnv?: string;
};

export function parseMarketPaymentMethods(raw: unknown): MarketPaymentMethodDef[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketPaymentMethodDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    if (!key) continue;
    out.push({
      key,
      labelKey: typeof o.labelKey === "string" ? o.labelKey : undefined,
      transferChannel: typeof o.transferChannel === "string" ? o.transferChannel.trim().toUpperCase() : undefined,
      referencePattern: typeof o.referencePattern === "string" ? o.referencePattern : undefined,
      verifyUrlEnv: typeof o.verifyUrlEnv === "string" ? o.verifyUrlEnv.trim() : undefined,
    });
  }
  return out;
}

export function transferChannelsFromMarketMethods(methods: MarketPaymentMethodDef[]): Set<string> {
  const out = new Set<string>();
  for (const m of methods) {
    if (m.transferChannel) out.add(m.transferChannel.toUpperCase());
  }
  return out;
}

export function paymentMethodForTransferChannel(
  methods: MarketPaymentMethodDef[],
  channel: string,
): MarketPaymentMethodDef | undefined {
  const normalized = channel.trim().toUpperCase();
  return methods.find((m) => m.transferChannel?.toUpperCase() === normalized);
}