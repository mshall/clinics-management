import { isMock } from "../common/provider-mode";
import { pickString, providerHttp } from "../common/provider-http";
import { metaCloudProviderFromEnv } from "./whatsapp-meta-cloud.provider";
import { whatsAppBackend } from "../common/provider-env";
import { DevInboxRecorder } from "./dev-inbox.recorder";
import type { WhatsAppSendResult } from "./whatsapp-provider.types";

export type WhatsAppSendResultLegacy = { ok: true } | { ok: false; error: string };

function normalizePhoneE164(phone: string): string {
  return phone.replace(/\s/g, "");
}

function whatsAppSandboxAllowed(toPhone: string): boolean {
  const list = process.env.WHATSAPP_SANDBOX_NUMBERS?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!list?.length) return true;
  const norm = normalizePhoneE164(toPhone);
  return list.some((n) => normalizePhoneE164(n) === norm);
}

/** @deprecated MS-01 — use {@link WhatsAppSendService.sendTemplateForTenant} in production. */
export async function sendWhatsAppMessage(toPhone: string, body: string): Promise<WhatsAppSendResultLegacy> {
  if (process.env.NODE_ENV === "production" && !isMock("whatsapp")) {
    return {
      ok: false,
      error: "Free-form WhatsApp is disabled outside the 24h session window. Use an approved template.",
    };
  }
  return sendWhatsAppMessageLegacy(toPhone, body);
}

export async function sendWhatsAppMessageLegacy(toPhone: string, body: string): Promise<WhatsAppSendResult> {
  if (isMock("whatsapp")) {
    // Mock mode (default): render into the dev inbox, never call a provider.
    const providerMessageId = `dev-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await DevInboxRecorder.record({ channel: "WHATSAPP", toAddress: toPhone, bodyText: body, providerMessageId });
    return { ok: true, providerMessageId };
  }
  const url = process.env.WHATSAPP_API_URL?.trim();
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  if (process.env.WHATSAPP_SANDBOX_NUMBERS?.trim() && !whatsAppSandboxAllowed(toPhone)) {
    return { ok: true, providerMessageId: `sandbox-legacy-${Date.now()}` };
  }
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "WHATSAPP_API_URL or WHATSAPP_API_TOKEN not configured", failureClass: "AUTH", retryable: false };
    }
    return { ok: true, providerMessageId: `dev-legacy-${Date.now()}` };
  }
  const res = await providerHttp({
    url,
    headers: { Authorization: `Bearer ${token}` },
    body: { to: toPhone.replace(/\s/g, ""), body, channel: "whatsapp" },
    timeoutMs: 10_000,
    retries: 2,
    secrets: [token],
  });
  if (!res.ok) {
    return { ok: false, error: `WhatsApp API: ${res.error}`, failureClass: res.failureClass === "AUTH" ? "AUTH" : res.retryable ? "TRANSIENT" : "UNKNOWN", retryable: res.retryable };
  }
  return { ok: true, providerMessageId: pickString(res.json, "id", "messageId", "message_id", "messages.0.id") ?? `http-${res.idempotencyKey}` };
}


/**
 * Sign-in / sign-up code over WhatsApp. In production free text is refused outside the 24 h window, so a real Meta number sends the code through an approved AUTHENTICATION template
 * (`WHATSAPP_OTP_TEMPLATE_NAME`, default `kiorly_auth_otp`; language `WHATSAPP_OTP_TEMPLATE_LANGUAGE`, default `en`). Mock mode and the generic http gateway keep the old text path.
 */
export async function sendWhatsAppOtp(toPhone: string, code: string, message: string): Promise<WhatsAppSendResultLegacy> {
  if (isMock("whatsapp") || whatsAppBackend() === "http") return sendWhatsAppMessage(toPhone, message);
  const provider = metaCloudProviderFromEnv();
  if (!provider) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured" };
  const r = await provider.sendAuthenticationOtp({ toPhone, code, templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim() || "kiorly_auth_otp", languageCode: process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE?.trim() || "en" });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
