import assert from "node:assert/strict";
import { test } from "node:test";
import { PaymentMethod, VisitCollectionMode } from "@prisma/client";
import { resolveFiscalPaymentMethodCode } from "./fiscal-payment-method";

test("card billing allocations map to ETA V", () => {
  assert.equal(
    resolveFiscalPaymentMethodCode({
      billingMethods: [PaymentMethod.CARD],
    }),
    "V",
  );
});

test("cash visit maps to C", () => {
  assert.equal(
    resolveFiscalPaymentMethodCode({
      collectionMode: VisitCollectionMode.CASH_ON_VISIT,
    }),
    "C",
  );
});

test("org channel fiscal code is used for transfers", () => {
  const code = resolveFiscalPaymentMethodCode(
    { collectionMode: VisitCollectionMode.MONEY_TRANSFER, transferChannel: "CLINIC_WALLET" },
    [],
    [
      {
        id: "1",
        name: "Wallet",
        channelKey: "CLINIC_WALLET",
        accountNumber: null,
        mobileNumber: "0100",
        referencePattern: "^[0-9]+$",
        fiscalPaymentCode: "V",
      },
    ],
  );
  assert.equal(code, "V");
});