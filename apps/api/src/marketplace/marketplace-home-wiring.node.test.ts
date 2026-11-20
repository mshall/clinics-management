import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import { HomeVisitsModule } from "../home-visits/home-visits.module";
import { MarketplaceModule } from "./marketplace.module";

/**
 * HVBK01/03 regression: MarketplaceApiService, SlotHoldService and MarketplaceBookingService take `@Optional() HomeVisitService`. Nest never injects an
 * @Optional() provider whose module is not imported, so without HomeVisitsModule here every Kiorex HOME slot / hold / booking answered
 * 400 "Home visits are not available" in the running app (the integration tests wire the service by hand and did not see it).
 */
describe("MarketplaceModule wires the home-visit services", () => {
  it("imports HomeVisitsModule", () => {
    const imports = Reflect.getMetadata("imports", MarketplaceModule) as unknown[];
    assert.ok(imports.includes(HomeVisitsModule));
  });
});
