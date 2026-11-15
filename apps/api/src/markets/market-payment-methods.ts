import type { MoneyTransferChannel } from "@prisma/client";

export type MarketPaymentMethodDef = {
  key: string;
  labelKey?: string;
  transferChannel?: MoneyTransferChannel | string;
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
      transferChannel: typeof o.transferChannel === "string" ? o.transferChannel : undefined,
    });
  }
  return out;
}

export function transferChannelsFromMarketMethods(methods: MarketPaymentMethodDef[]): Set<MoneyTransferChannel> {
  const out = new Set<MoneyTransferChannel>();
  for (const m of methods) {
    const ch = m.transferChannel?.toString().toUpperCase();
    if (ch === "INSTAPAY") out.add("INSTAPAY");
    if (ch === "FAWRY") out.add("FAWRY");
  }
  return out;
}