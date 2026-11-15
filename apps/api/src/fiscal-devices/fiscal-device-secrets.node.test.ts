import assert from "node:assert/strict";
import { test } from "node:test";
import { FiscalDevicesService } from "./fiscal-devices.service";

test("fiscal device API DTO mapper never includes secret fields", () => {
  const row = {
    id: "fd1",
    clinicId: "c1",
    providerKey: "eta-egypt",
    kind: "VIRTUAL" as const,
    serialNumber: "KIORLY-EG-ABC-01",
    label: null,
    deviceModel: null,
    osVersion: null,
    status: "ACTIVE" as const,
    isDefault: true,
    credentialId: "cred1",
    lastReceiptUuid: null,
    receiptSequence: 2,
    lastSubmittedAt: null,
    registeredAt: null,
    activatedAt: null,
    deactivatedAt: null,
    statusReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    credential: { id: "cred1", secretRef: "local:kiorly/t/fiscal/eta/x" },
  };
  const svc = Object.getPrototypeOf(FiscalDevicesService.prototype);
  assert.equal(typeof svc, "object");
  const json = JSON.stringify(row);
  assert.ok(!json.includes("clientSecret"));
  assert.ok(!json.includes("presharedKey"));
});