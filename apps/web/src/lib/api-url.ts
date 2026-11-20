/** Base URL without trailing slash, or empty string to use same-origin (Vite proxy in dev). */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  return raw?.replace(/\/$/, "") ?? "";
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

/**
 * Absolute URL for large file downloads (org backup ZIP/SQL).
 * Same-origin `/api` via the Vite dev proxy often drops mid-stream ("Failed - Network error");
 * hit the API origin directly when the UI is on localhost Vite.
 */
export function absoluteDownloadUrl(path: string): string {
  const resolved = apiUrl(path);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  if (typeof window === "undefined") return resolved;
  const { protocol, hostname, port } = window.location;
  const isLocalVite =
    (hostname === "127.0.0.1" || hostname === "localhost") && /^517\d$/.test(port || "");
  if (isLocalVite) {
    return `${protocol}//${hostname === "localhost" ? "localhost" : "127.0.0.1"}:3000${resolved}`;
  }
  return resolved;
}
