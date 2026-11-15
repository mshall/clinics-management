import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPaymentChannelContactFields,
  channelKeyFromPaymentChannelName,
} from "./tenant-payment-channel-key";

test("channelKeyFromPaymentChannelName is uppercase and unique", () => {
  const k1 = channelKeyFromPaymentChannelName("Clinic InstaPay", []);
  assert.equal(k1, "CLINIC_INSTAPAY");
  const k2 = channelKeyFromPaymentChannelName("Clinic InstaPay", [k1]);
  assert.notEqual(k1, k2);
});

test("assertPaymentChannelContactFields requires at least one contact", () => {
  assert.throws(() => assertPaymentChannelContactFields("", ""), /account number/);
  assert.doesNotThrow(() => assertPaymentChannelContactFields("123", ""));
  assert.doesNotThrow(() => assertPaymentChannelContactFields("", "+20123456789"));
});