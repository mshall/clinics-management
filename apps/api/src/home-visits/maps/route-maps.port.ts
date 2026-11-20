import type { TravelMatrix } from "@kiorly/field-visit";

export type RouteStop = { id: string; districtId: string; lat?: number; lng?: number };
export type RouteLegResult = { fromId: string; toId: string; travelMinutes: number };

/**
 * Maps / routing for the "Today" route (HVEXE01) and travel-time planning (clinic.home_route_view).
 * MODE=mock|real (KIORLY_PROVIDER_MODE_MAPS, default mock). The real adapter is Amazon Location (infra/tofu/modules/aws/location),
 * wired in the provider go-live pass; no `@aws-sdk/*` outside `src/platform/adapters/*`.
 */
export interface RouteMapsPort {
  readonly mode: "mock" | "real";
  /** Travel minutes between districts for the coverage check (maxTravelMinutes) and route feasibility. */
  travelMatrix(districtIds: readonly string[]): TravelMatrix;
  /** Legs between consecutive stops (stops already in visit order). */
  legs(stops: readonly RouteStop[]): RouteLegResult[];
  /** Deep link to open a navigation app at the address. Built only for an entitled viewer at request time, never stored. */
  navigationUrl(target: { lat?: number; lng?: number; query?: string }): string;
}

export const ROUTE_MAPS_PORT = Symbol("ROUTE_MAPS_PORT");
