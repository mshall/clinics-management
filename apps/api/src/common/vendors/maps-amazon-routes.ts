import { awsRegionFromHost, signV4 } from "./sigv4";

/**
 * Amazon Location Service Routes v2, CalculateRouteMatrix (same family as the platform's Places v2 geocode in kiorex-platform vendors/maps-amazon.ts).
 * MAPS_API_URL=https://routes.geo.<region>.amazonaws.com ; auth = ?key=<API key> or SigV4 (service `geo-routes`).
 *   POST /v2/route-matrix  { Origins:[{Position:[lng,lat]}], Destinations:[{Position:[lng,lat]}], TravelMode:'Car', RoutingBoundary:{Unbounded:true} }
 *   -> { RouteMatrix: [[{ Distance, Duration (seconds) } | { Error }, ...], ...], ErrorCount }
 * Wire format written from the AWS documentation; verify against a real staging key during the provider go-live pass (Docs/KIORLY_NEEDS_HUMAN.md).
 */
export type LngLat = [number, number];

export function routeMatrixBody(origins: readonly LngLat[], destinations: readonly LngLat[], travelMode = "Car") {
  return {
    Origins: origins.map((Position) => ({ Position })),
    Destinations: destinations.map((Position) => ({ Position })),
    TravelMode: travelMode,
    RoutingBoundary: { Unbounded: true },
  };
}

/** Minutes (rounded UP, minimum 1 for a reachable pair) per [origin][destination]; null where AWS reported an error for that cell. */
export function parseRouteMatrix(json: unknown): Array<Array<number | null>> | null {
  const m = (json as { RouteMatrix?: unknown } | null)?.RouteMatrix;
  if (!Array.isArray(m)) return null;
  return m.map((row) => (Array.isArray(row) ? row.map((c: { Duration?: unknown; Error?: unknown }) => (typeof c?.Duration === "number" && !c?.Error ? Math.max(1, Math.ceil(c.Duration / 60)) : null)) : []));
}

export function amazonRoutesSigner(apiUrl: string, accessKeyId: string, secretAccessKey: string) {
  const region = awsRegionFromHost(new URL(apiUrl).host);
  return region ? (r: { method: string; url: string; body: string }) => signV4({ ...r, accessKeyId, secretAccessKey, region, service: "geo-routes", headers: { "content-type": "application/json" } }) : undefined;
}
