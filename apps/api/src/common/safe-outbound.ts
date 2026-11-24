import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * SSRF guard for server-side requests to URLs a tenant chose (integration webhooks). Pentest 2026-11 finding KX-PT-02.
 *
 *  - only http(s), no credentials in the URL, https only in production;
 *  - every address the host resolves to must be public (no loopback, RFC1918, link-local / cloud metadata 169.254.0.0/16, CGNAT, ULA, multicast, reserved);
 *  - the check runs inside the socket's `lookup`, so the address that is validated is the address that is connected to (no DNS-rebinding window);
 *  - redirects are never followed (a 3xx is a delivery failure), the response body is capped, the request has a hard timeout.
 * Private targets are allowed only outside production, or when WEBHOOK_ALLOW_PRIVATE_TARGETS=true (an explicit operator decision for self-hosted receivers).
 */
type Env = Record<string, string | undefined>;

export class UnsafeUrlError extends Error {
  constructor(public readonly reason: string) { super(`URL not allowed: ${reason}`); this.name = "UnsafeUrlError"; }
}

export const privateTargetsAllowed = (env: Env = process.env): boolean => env.NODE_ENV !== "production" || env.WEBHOOK_ALLOW_PRIVATE_TARGETS === "true";

function ipv4ToInt(ip: string): number { return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }
const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** True when the address is NOT a routable public unicast address. */
export function isNonPublicAddress(address: string): boolean {
  let ip = address.trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const zone = ip.indexOf("%"); if (zone >= 0) ip = ip.slice(0, zone);
  const fam = net.isIP(ip);
  if (fam === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => { const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (n & mask) === (ipv4ToInt(base) & mask); });
  }
  if (fam === 6) {
    const mapped = ip.match(/^(?:0{0,4}:){0,5}(?:ffff:)(\d+\.\d+\.\d+\.\d+)$/) ?? ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isNonPublicAddress(mapped[1]!);
    const hexMapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) { const a = parseInt(hexMapped[1]!, 16), b = parseInt(hexMapped[2]!, 16); return isNonPublicAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    if (ip === "::" || ip === "::1") return true;
    if (/^(fc|fd)/.test(ip)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link local
    if (/^ff/.test(ip)) return true; // multicast
    if (/^2001:0?db8:/.test(ip) || /^2001:0{0,3}:/.test(ip) || /^64:ff9b:/.test(ip) || /^100:/.test(ip) || /^2002:/.test(ip)) return true; // documentation, Teredo, NAT64, discard, 6to4
    return false;
  }
  return true; // not an IP at all: refuse
}

/** Synchronous shape checks (scheme, credentials, literal IP hosts). Returns the parsed URL or throws UnsafeUrlError. */
export function parseWebhookTarget(raw: string, env: Env = process.env): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new UnsafeUrlError("not a valid URL"); }
  const priv = privateTargetsAllowed(env);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && priv)) throw new UnsafeUrlError("https is required");
  if (u.username || u.password) throw new UnsafeUrlError("credentials in the URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("missing host");
  if (!priv) {
    if (net.isIP(host) && isNonPublicAddress(host)) throw new UnsafeUrlError("private or reserved address");
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/i.test(host)) throw new UnsafeUrlError("internal host name");
    if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) throw new UnsafeUrlError("numeric host");
  }
  return u;
}

/** Full check including DNS (for validation at save time). */
export async function assertPublicWebhookUrl(raw: string, env: Env = process.env, resolver: (h: string) => Promise<string[]> = defaultResolver): Promise<URL> {
  const u = parseWebhookTarget(raw, env);
  if (privateTargetsAllowed(env)) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return u;
  let addrs: string[];
  try { addrs = await resolver(host); } catch { throw new UnsafeUrlError("host does not resolve"); }
  if (!addrs.length) throw new UnsafeUrlError("host does not resolve");
  if (addrs.some(isNonPublicAddress)) throw new UnsafeUrlError("host resolves to a private or reserved address");
  return u;
}

async function defaultResolver(host: string): Promise<string[]> {
  const r = await dns.promises.lookup(host, { all: true, verbatim: true });
  return r.map((x) => x.address);
}

export type SafeResponse = { ok: boolean; status: number; text: () => Promise<string> };

/**
 * POST (or any method) without following redirects, with the address checked at connect time. Throws UnsafeUrlError / Error on failure.
 * `env` is injectable for tests; `lookupImpl` lets tests simulate DNS answers.
 */
export function safeRequest(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBodyBytes?: number },
  env: Env = process.env,
  lookupImpl: typeof dns.lookup = dns.lookup,
): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = parseWebhookTarget(rawUrl, env); } catch (e) { reject(e); return; }
    const priv = privateTargetsAllowed(env);
    const lib = u.protocol === "https:" ? https : http;
    const lookup = ((hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void) => {
      lookupImpl(hostname, { ...options, all: true, verbatim: true }, (err, addrs) => {
        if (err) return cb(err);
        const list = addrs as unknown as dns.LookupAddress[];
        const bad = !priv && list.some((a) => isNonPublicAddress(a.address));
        if (bad || !list.length) return cb(Object.assign(new Error("UNSAFE_ADDRESS"), { code: "EUNSAFE" }) as NodeJS.ErrnoException);
        if (options.all) return cb(null, list);
        cb(null, list[0]!.address, list[0]!.family);
      });
    }) as unknown as net.LookupFunction;
    const max = init.maxBodyBytes ?? 4096;
    const req = lib.request(u, { method: init.method ?? "POST", headers: { ...(init.headers ?? {}), ...(init.body !== undefined ? { "content-length": String(Buffer.byteLength(init.body)) } : {}) }, lookup, timeout: init.timeoutMs ?? 15_000 }, (res) => {
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (c: Buffer) => { if (size < max) { chunks.push(c); size += c.length; } });
      res.on("end", () => { const status = res.statusCode ?? 0; resolve({ ok: status >= 200 && status < 300, status, text: async () => Buffer.concat(chunks).subarray(0, max).toString("utf8") }); });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => reject((e as NodeJS.ErrnoException).code === "EUNSAFE" ? new UnsafeUrlError("host resolves to a private or reserved address") : e));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
