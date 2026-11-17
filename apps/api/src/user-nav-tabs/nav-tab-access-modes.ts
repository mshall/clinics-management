import { VALID_NAV_TAB_KEYS } from "./nav-tab-keys";

export type NavTabAccessMode = "read" | "write";

export function parseTabAccessModes(raw: unknown): Record<string, NavTabAccessMode> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, NavTabAccessMode> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_NAV_TAB_KEYS.has(key)) continue;
    const mode = String(val).toLowerCase();
    if (mode === "read" || mode === "write") out[key] = mode;
  }
  return out;
}

/** Keep only modes for tabs in the grant; default missing keys to write. */
export function sanitizeTabAccessModes(
  tabKeys: string[],
  requested: Record<string, NavTabAccessMode> | null | undefined,
): Record<string, NavTabAccessMode> | null {
  const keySet = new Set(tabKeys);
  const parsed = requested ?? {};
  const out: Record<string, NavTabAccessMode> = {};
  for (const key of tabKeys) {
    if (key === "profile") continue;
    const mode = parsed[key];
    out[key] = mode === "read" ? "read" : "write";
  }
  // Drop orphaned mode keys not in tabKeys
  for (const key of Object.keys(parsed)) {
    if (!keySet.has(key)) continue;
    if (key === "profile") continue;
    if (!(key in out)) out[key] = parsed[key] === "read" ? "read" : "write";
  }
  const allWrite = Object.values(out).every((m) => m === "write");
  if (allWrite) return null;
  return out;
}

export function tabAccessModeForTab(
  modes: Record<string, NavTabAccessMode> | null | undefined,
  tab: string,
): NavTabAccessMode {
  return modes?.[tab] === "read" ? "read" : "write";
}