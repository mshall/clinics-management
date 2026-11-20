import { createHash } from "node:crypto";
import type { TravelMatrix } from "@kiorly/field-visit";
import type { RouteLegResult, RouteMapsPort, RouteStop } from "./route-maps.port";

/** Deterministic, symmetric district-pair travel time in [10, 45] minutes (same pair => same value on every call). */
export function mockTravelMinutes(a: string, b: string): number {
  if (a === b) return 5;
  const [x, y] = [a, b].sort();
  const h = createHash("sha256").update(`${x}|${y}`).digest();
  return 10 + (h[0]! % 36);
}

/** MODE=mock routing/maps: no network, no keys, same call shape the Amazon Location adapter will implement. */
export class MockRouteMapsAdapter implements RouteMapsPort {
  readonly mode = "mock" as const;

  travelMatrix(): TravelMatrix {
    return { minutes: (from, to) => mockTravelMinutes(from, to) };
  }

  legs(stops: readonly RouteStop[]): RouteLegResult[] {
    const out: RouteLegResult[] = [];
    for (let i = 1; i < stops.length; i++) {
      out.push({ fromId: stops[i - 1]!.id, toId: stops[i]!.id, travelMinutes: mockTravelMinutes(stops[i - 1]!.districtId, stops[i]!.districtId) });
    }
    return out;
  }

  navigationUrl(target: { lat?: number; lng?: number; query?: string }): string {
    if (target.lat != null && target.lng != null) return `https://maps.mock.kiorly.test/dir/?destination=${target.lat},${target.lng}`;
    return `https://maps.mock.kiorly.test/search/?q=${encodeURIComponent(target.query ?? "")}`;
  }
}

/** MODE=real placeholder: fails closed until the Amazon Location adapter is wired (Docs/KIORLY_NEEDS_HUMAN.md, Provider go-live). */
export class UnwiredRealRouteMapsAdapter implements RouteMapsPort {
  readonly mode = "real" as const;
  private fail(): never {
    throw new Error("Real route/maps adapter is not wired (Provider go-live: Amazon Location, infra/tofu/modules/aws/location)");
  }
  travelMatrix(): TravelMatrix {
    return this.fail();
  }
  legs(): RouteLegResult[] {
    return this.fail();
  }
  navigationUrl(): string {
    return this.fail();
  }
}
