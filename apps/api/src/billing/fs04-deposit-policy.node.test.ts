import assert from "node:assert/strict";
import { test } from "node:test";
import { DEPOSIT_POLICY_DEFAULTS } from "../markets/commercial-config.schema";
import {
  depositLinkExpiry,
  depositRequirement,
  hashDepositLinkToken,
  newDepositLinkToken,
  resolveDepositPolicy,
} from "./deposit-policy";

const base = { patientFlag: false, noShowCount: 0, riskScore: null, typeDepositAmount: null, feeAmount: 400 };

test("policy: market pack overrides code defaults, clinic overrides market; invalid parts are ignored", () => {
  assert.deepEqual(resolveDepositPolicy(null, null), DEPOSIT_POLICY_DEFAULTS);
  const p = resolveDepositPolicy({ deposits: { noShowThreshold: 3, linkExpiryHours: 12 } }, { linkExpiryHours: 6, autoCancelUnpaid: true });
  assert.equal(p.noShowThreshold, 3);
  assert.equal(p.linkExpiryHours, 6);
  assert.equal(p.autoCancelUnpaid, true);
  assert.equal(resolveDepositPolicy({ deposits: { noShowThreshold: -1 } }, null).noShowThreshold, DEPOSIT_POLICY_DEFAULTS.noShowThreshold);
});

test("requirement: each rule on its own triggers a deposit", () => {
  const p = DEPOSIT_POLICY_DEFAULTS;
  assert.equal(depositRequirement(base, p).required, false);
  assert.deepEqual(depositRequirement({ ...base, patientFlag: true }, p).reasons, ["PATIENT_FLAG"]);
  assert.deepEqual(depositRequirement({ ...base, noShowCount: p.noShowThreshold }, p).reasons, ["NO_SHOWS"]);
  assert.equal(depositRequirement({ ...base, noShowCount: p.noShowThreshold - 1 }, p).required, false);
  assert.deepEqual(depositRequirement({ ...base, riskScore: p.riskScoreThreshold }, p).reasons, ["RISK_SCORE"]);
  assert.deepEqual(depositRequirement({ ...base, typeDepositAmount: 150 }, p).reasons, ["APPOINTMENT_TYPE"]);
});

test("amount: type deposit, else percent of fee, never above the fee; zero fee and no type → not required", () => {
  const p = DEPOSIT_POLICY_DEFAULTS;
  assert.equal(depositRequirement({ ...base, patientFlag: true }, p).amount, 120);
  assert.equal(depositRequirement({ ...base, typeDepositAmount: 150 }, p).amount, 150);
  assert.equal(depositRequirement({ ...base, typeDepositAmount: 900 }, p).amount, 400);
  const free = depositRequirement({ ...base, patientFlag: true, feeAmount: 0 }, p);
  assert.equal(free.required, false);
});

test("link expiry never runs past the appointment start", () => {
  const now = new Date("2027-01-01T08:00:00Z");
  const far = new Date("2027-01-05T08:00:00Z");
  const soon = new Date("2027-01-01T10:00:00Z");
  assert.equal(depositLinkExpiry(now, far, DEPOSIT_POLICY_DEFAULTS).toISOString(), "2027-01-02T08:00:00.000Z");
  assert.equal(depositLinkExpiry(now, soon, DEPOSIT_POLICY_DEFAULTS).toISOString(), soon.toISOString());
});

test("only the token hash is stored", () => {
  const { token, hash } = newDepositLinkToken();
  assert.ok(token.length >= 32);
  assert.notEqual(token, hash);
  assert.equal(hashDepositLinkToken(token), hash);
});
