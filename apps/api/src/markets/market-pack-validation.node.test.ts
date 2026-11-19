import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketLaunchStatus, type Market } from "@prisma/client";
import { assertLiveMarketHasCrossBorderApproval, assertLiveMarketHasTaxPack } from "./market-pack-validation";

test("assertLiveMarketHasTaxPack rejects LIVE market without tax keys", () => {
  const draft = {
    code: "XX",
    status: MarketLaunchStatus.DRAFT,
    taxConfig: {},
  } as Market;
  assert.doesNotThrow(() => assertLiveMarketHasTaxPack(draft));

  const live = {
    code: "XX",
    status: MarketLaunchStatus.LIVE,
    taxConfig: {},
  } as Market;
  assert.throws(() => assertLiveMarketHasTaxPack(live), /taxConfig/);
});

test("assertLiveMarketHasCrossBorderApproval passes EG with pilot exception", () => {
  const market = {
    code: "EG",
    status: MarketLaunchStatus.LIVE,
    hostCell: "frankfurt",
    dataRegion: "eu-central-1",
    legalConfig: { pilotException: { active: true, legalRef: "pilot-1", expiresAt: "2028-01-01" } },
  } as unknown as Market;
  assert.doesNotThrow(() => assertLiveMarketHasCrossBorderApproval(market));
});