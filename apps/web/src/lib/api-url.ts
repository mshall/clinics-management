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

/** Local web port → Nest API port (main uses 5190→3020; other branches 5174→3010). */
const LOCAL_WEB_TO_API_PORT: Record<string, string> = {
  "5173": "3000",
  "5174": "3010",
  "5180": "3010",
  "5190": "3020",
};

function localDevApiPort(webPort: string): string {
  const fromVite = (import.meta.env.VITE_DEV_API_PORT as string | undefined)?.trim();
  if (fromVite) return fromVite;
  return LOCAL_WEB_TO_API_PORT[webPort] ?? "3010";
}

/**
 * Absolute URL for large file downloads (org backup ZIP/SQL).
 * Same-origin `/api` via the Vite / preview proxy often drops mid-stream ("Failed - Network error");
 * hit the API origin directly when the UI is on a local Vite or preview port.
 */
export function absoluteDownloadUrl(path: string): string {
  const resolved = apiUrl(path);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  if (typeof window === "undefined") return resolved;
  const { protocol, hostname, port } = window.location;
  const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost";
  // Vite / preview local web ports (517x, 518x, 519x) and common alt ports.
  const isLocalDevWeb = isLocalHost && /^(517\d|518\d|519\d|3001|4173)$/.test(port || "");
  if (isLocalDevWeb) {
    const apiHost = hostname === "localhost" ? "localhost" : "127.0.0.1";
    const apiPort = localDevApiPort(port || "");
    return `${protocol}//${apiHost}:${apiPort}${resolved}`;
  }
  return resolved;
}
