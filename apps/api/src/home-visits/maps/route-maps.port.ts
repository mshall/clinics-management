import type { TravelMatrix } from "@kiorly/field-visit";

export type RouteStop = { id: string; districtId: string; lat?: number; lng?: number };
export type RouteLegResult = { fromId: string; toId: string; travelMinutes: number };

/**
 * Maps / routing for the "Today" route (HVEXE01) and travel-time planning (clinic.home_route_view).
 * MODE=mock|real (MAPS_MODE or KIORLY_PROVIDER_MODE_MAPS, default mock). The real adapter is Amazon Location Routes v2 (AmazonRouteMapsAdapter, plain HTTPS, config only: MAPS_API_URL,
 * MAPS_API_KEY or MAPS_ACCESS_KEY_ID/MAPS_SECRET_ACCESS_KEY, MAPS_DISTRICT_CENTROIDS_*); no `@aws-sdk/*` outside `src/platform/adapters/*`.
 */
export type MaybePromise<T> = T | Promise<T>;

export interface RouteMapsPort {
  readonly mode: "mock" | "real";
  /**
   * Travel minutes between districts for the coverage check (maxTravelMinutes) and route feasibility. Async-capable (the real adapter calls Amazon Location):
   * it must prefetch every pair among `districtIds`, because the returned `TravelMatrix` (shared, synchronous domain code) only looks values up. Callers always `await`.
   */
  travelMatrix(districtIds: readonly string[]): MaybePromise<TravelMatrix>;
  /** Legs between consecutive stops (stops already in visit order). Legs whose position is unknown are omitted. */
  legs(stops: readonly RouteStop[]): MaybePromise<RouteLegResult[]>;
  /** Deep link to open a navigation app at the address. Built only for an entitled viewer at request time, never stored. */
  navigationUrl(target: { lat?: number; lng?: number; query?: string }): string;
}

export const ROUTE_MAPS_PORT = Symbol("ROUTE_MAPS_PORT");
