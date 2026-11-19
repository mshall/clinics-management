import type { Prisma } from "@prisma/client";

export type ProviderSettingsMap = Record<string, Record<string, unknown>>;

export function readProviderSettings(raw: unknown): ProviderSettingsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProviderSettingsMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = { ...(val as Record<string, unknown>) };
    }
  }
  return out;
}

export function mergeProviderBlock(
  current: unknown,
  providerKey: string,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const map = readProviderSettings(current);
  map[providerKey] = { ...(map[providerKey] ?? {}), ...patch };
  return map as Prisma.InputJsonValue;
}