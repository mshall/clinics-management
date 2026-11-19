/** UX-01 — PWA install + web push helpers (no PHI in push payloads beyond appointment ids). */

const INSTALL_DISMISSED_KEY = "kiorly.pwa.installDismissed";
const PUSH_PROMPTED_KEY = "kiorly.pwa.pushPrompted";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function captureInstallPrompt(e: Event) {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
}

export function getDeferredInstallPrompt() {
  return deferredPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null;
}

export function isInstallDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function wasPushPrompted(): boolean {
  try {
    return localStorage.getItem(PUSH_PROMPTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPushPrompted() {
  try {
    localStorage.setItem(PUSH_PROMPTED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS Safari
  const ios = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(mq || ios);
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerPushSubscription(apiPost: (path: string, body: unknown) => Promise<unknown>) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false as const, reason: "unsupported" };
  }
  const vapid = (import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC as string | undefined)?.trim();
  if (!vapid) return { ok: false as const, reason: "vapid_unset" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false as const, reason: "denied" };

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    }));
  const json = sub.toJSON();
  await apiPost("/api/v1/push/subscriptions", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    userAgent: navigator.userAgent.slice(0, 500),
  });
  markPushPrompted();
  return { ok: true as const };
}
