import { readFileSync } from "node:fs";
import { ServiceUnavailableException } from "@nestjs/common";
import type { TravelMatrix } from "@kiorly/field-visit";
import type { MapsConfig } from "../../common/provider-env";
import { providerHttp, type ProviderHttpRequest } from "../../common/provider-http";
import { amazonRoutesSigner, parseRouteMatrix, routeMatrixBody, type LngLat } from "../../common/vendors/maps-amazon-routes";
import type { RouteLegResult, RouteMapsPort, RouteStop } from "./route-maps.port";

const TTL_MS = 24 * 3600_000;
const MAX_LOCATIONS = 25; // one matrix call per request: 25 x 25 cells

/** `{ "<districtId>": [lat, lng] }`, from MAPS_DISTRICT_CENTROIDS_JSON or the file named by MAPS_DISTRICT_CENTROIDS_FILE. Ids are matched as given (already normalised by the caller). */
export function loadCentroids(cfg: Pick<MapsConfig, "centroidsJson" | "centroidsFile">): Map<string, LngLat> {
  const raw = cfg.centroidsJson || (cfg.centroidsFile ? readFileSync(cfg.centroidsFile, "utf8") : "{}");
  const out = new Map<string, LngLat>();
  for (const [id, v] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
    if (Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number") out.set(id, [v[1], v[0]]); // stored lat,lng; AWS wants lng,lat
  }
  return out;
}

/**
 * MAPS_MODE=real routing: Amazon Location Routes v2 route matrix over HTTPS (no SDK). The port is async-capable: the shared domain code keeps its synchronous
 * `TravelMatrix.minutes(a, b)` lookup, and this adapter prefetches every pair it will ask about (one matrix call, cached 24 h per pair) before handing it back.
 * A provider failure fails closed with 503 (never a guessed travel time).
 */
export class AmazonRouteMapsAdapter implements RouteMapsPort {
  readonly mode = "real" as const;
  private readonly cache = new Map<string, { minutes: number | null; at: number }>();
  private readonly centroids: Map<string, LngLat>;

  constructor(
    private readonly cfg: MapsConfig,
    private readonly http: Pick<ProviderHttpRequest, "fetchImpl" | "sleep"> = {},
    private readonly now: () => number = Date.now,
    centroids?: Map<string, LngLat>,
  ) {
    this.centroids = centroids ?? loadCentroids(cfg);
  }

  private async matrix(origins: readonly LngLat[], destinations: readonly LngLat[]): Promise<Array<Array<number | null>>> {
    const base = this.cfg.apiUrl.replace(/\/+$/, "");
    const url = `${base}/v2/route-matrix${this.cfg.apiKey ? `?key=${encodeURIComponent(this.cfg.apiKey)}` : ""}`;
    const body = routeMatrixBody(origins, destinations, this.cfg.travelMode);
    const sign = !this.cfg.apiKey && this.cfg.accessKeyId ? amazonRoutesSigner(base, this.cfg.accessKeyId, this.cfg.secretAccessKey) : undefined;
    const res = await providerHttp({
      url, body, timeoutMs: this.cfg.timeoutMs, retries: this.cfg.maxRetries, backoffMs: this.cfg.backoffMs,
      headers: sign ? sign({ method: "POST", url, body: JSON.stringify(body) }) : {},
      secrets: [this.cfg.apiKey, this.cfg.secretAccessKey], ...this.http,
    });
    const parsed = res.ok ? parseRouteMatrix(res.json) : null;
    if (!res.ok || !parsed) throw new ServiceUnavailableException(`Route provider unavailable (${res.ok ? "unexpected response" : res.error})`);
    return parsed;
  }

  private key(a: string, b: string) { return `${a}|${b}`; }
  private fresh(a: string, b: string) { const c = this.cache.get(this.key(a, b)); return c && this.now() - c.at < TTL_MS ? c : undefined; }

  async travelMatrix(districtIds: readonly string[]): Promise<TravelMatrix> {
    const ids = [...new Set(districtIds.filter((d) => d && this.centroids.has(d)))].slice(0, MAX_LOCATIONS);
    const missing = ids.some((a) => ids.some((b) => !this.fresh(a, b)));
    if (ids.length && missing) {
      const pts = ids.map((d) => this.centroids.get(d)!);
      const m = await this.matrix(pts, pts);
      ids.forEach((a, i) => ids.forEach((b, j) => this.cache.set(this.key(a, b), { minutes: a === b ? 0 : m[i]?.[j] ?? null, at: this.now() })));
    }
    return { minutes: (from, to) => (from === to ? 0 : this.fresh(from, to)?.minutes ?? null) };
  }

  private position(s: RouteStop): LngLat | null {
    if (s.lat != null && s.lng != null) return [s.lng, s.lat];
    return this.centroids.get(s.districtId) ?? null;
  }

  async legs(stops: readonly RouteStop[]): Promise<RouteLegResult[]> {
    const out: RouteLegResult[] = [];
    const pairs: Array<{ from: RouteStop; to: RouteStop; a: LngLat; b: LngLat }> = [];
    for (let i = 1; i < stops.length; i++) {
      const a = this.position(stops[i - 1]!); const b = this.position(stops[i]!);
      if (a && b) pairs.push({ from: stops[i - 1]!, to: stops[i]!, a, b }); // unknown position: leg omitted (shown as unknown), never guessed
    }
    for (let off = 0; off < pairs.length; off += MAX_LOCATIONS) {
      const chunk = pairs.slice(off, off + MAX_LOCATIONS);
      const m = await this.matrix(chunk.map((p) => p.a), chunk.map((p) => p.b));
      chunk.forEach((p, i) => { const minutes = m[i]?.[i]; if (minutes != null) out.push({ fromId: p.from.id, toId: p.to.id, travelMinutes: minutes }); });
    }
    return out;
  }

  /** A universal link that opens the user's own maps app; built only for an entitled viewer at request time, never stored. No provider call. */
  navigationUrl(target: { lat?: number; lng?: number; query?: string }): string {
    if (target.lat != null && target.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target.query ?? "")}`;
  }
}
