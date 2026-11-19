/**
 * Provider mode (CLAUDE.md "Messaging & provider integrations are MOCKED for now").
 *
 * Every third-party integration sits behind an adapter with `MODE=mock|real`, default **mock**:
 *   KIORLY_PROVIDER_MODE_<KIND>   per integration (EMAIL, WHATSAPP, SMS, PUSH, PSP)
 *   KIORLY_PROVIDER_MODE          global default for every kind
 * Unset => mock. The only legacy exception: in NODE_ENV=production a deployment that already carries the old
 * enabling switch (EMAIL_SES_ENABLED=1, WhatsApp access token, VAPID keys) keeps behaving as real until it sets
 * the mode explicitly. Real providers are wired in a dedicated pre-launch pass (Docs/KIORLY_NEEDS_HUMAN.md,
 * "Provider go-live"). No credentials ever live in code.
 */
export type ProviderKind = "email" | "whatsapp" | "sms" | "push" | "psp";
export type ProviderMode = "mock" | "real";

const LEGACY_REAL_SWITCH: Record<ProviderKind, () => boolean> = {
  email: () => process.env.EMAIL_SES_ENABLED === "1",
  whatsapp: () => Boolean((process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN)?.trim()),
  sms: () => false,
  push: () => Boolean(process.env.WEB_PUSH_VAPID_PUBLIC?.trim() && process.env.WEB_PUSH_VAPID_PRIVATE?.trim()),
  psp: () => false,
};

function parse(raw: string | undefined): ProviderMode | null {
  const v = raw?.trim().toLowerCase();
  return v === "real" || v === "mock" ? v : null;
}

export function providerMode(kind: ProviderKind): ProviderMode {
  const explicit = parse(process.env[`KIORLY_PROVIDER_MODE_${kind.toUpperCase()}`]) ?? parse(process.env.KIORLY_PROVIDER_MODE);
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production" && LEGACY_REAL_SWITCH[kind]()) return "real";
  return "mock";
}

export function isMock(kind: ProviderKind): boolean {
  return providerMode(kind) === "mock";
}

export const PROVIDER_KINDS: readonly ProviderKind[] = ["email", "whatsapp", "sms", "push", "psp"];

export function providerModes(): Record<ProviderKind, ProviderMode> {
  return Object.fromEntries(PROVIDER_KINDS.map((k) => [k, providerMode(k)])) as Record<ProviderKind, ProviderMode>;
}
