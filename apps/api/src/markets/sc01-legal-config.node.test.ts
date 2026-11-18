import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketLaunchStatus, type Market } from "@prisma/client";
import {
  assertSubProcessorAllowedForFeatureFlag,
  hasCrossBorderLaunchApproval,
  readLegalConfig,
} from "./market-legal-guards";
import {
  assertLiveMarketHasCrossBorderApproval,
  assertMarketReadyForCrossBorderLaunch,
} from "./market-pack-validation";

const egLiveBase = {
  code: "EG",
  status: MarketLaunchStatus.LIVE,
  hostCell: "frankfurt",
  dataRegion: "eu-central-1",
  legalConfig: {},
} as Market;

test("SC-01: LIVE EG without legal pack is rejected", () => {
  assert.throws(() => assertLiveMarketHasCrossBorderApproval(egLiveBase), /crossBorderTransfer/);
  assert.throws(() => assertMarketReadyForCrossBorderLaunch(egLiveBase), /cross-border transfer approval/);
});

test("SC-01: pilot exception satisfies launch gate", () => {
  const market = {
    ...egLiveBase,
    legalConfig: {
      pilotException: { active: true, legalRef: "legal-signed-2026", expiresAt: "2028-12-31" },
    },
  } as Market;
  assert.equal(hasCrossBorderLaunchApproval(readLegalConfig(market)), true);
  assert.doesNotThrow(() => assertLiveMarketHasCrossBorderApproval(market));
});

test("SC-01: enabling ai_assistant rejected when sub-processor not approved", () => {
  const market = {
    code: "EG",
    legalConfig: {
      crossBorderTransfer: {
        approvalRef: "PDPC-TEST",
        issuedAt: "2026-06-01",
        expiresAt: "2028-06-01",
        destination: "DE (eu-central-1)",
        subProcessors: ["aws-eu-central-1"],
      },
    },
  } as unknown as Market;
  assert.throws(
    () => assertSubProcessorAllowedForFeatureFlag(market, "ai_assistant", true),
    /not on the market cross-border approval list/,
  );
  assert.doesNotThrow(() => assertSubProcessorAllowedForFeatureFlag(market, "ai_assistant", false));
});

test("SC-01: non cross-border markets skip approval gate", () => {
  const market = {
    code: "XX",
    status: MarketLaunchStatus.LIVE,
    legalConfig: {},
  } as Market;
  assert.doesNotThrow(() => assertLiveMarketHasCrossBorderApproval(market));
});