import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketLaunchStatus, type Market } from "@prisma/client";
import { assertLiveMarketHasTaxPack } from "./market-pack-validation";

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