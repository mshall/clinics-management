import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KiorlyInvoiceStatus } from "@prisma/client";
import { KiorlyInvoicesService } from "./kiorly-invoices.service";
import { formatKiorlyInvoiceNumber } from "./kiorly-invoice-numbering";

describe("SB-01 Kiorly invoice guards", () => {
  const svc = new KiorlyInvoicesService(null as never, null as never, null as never);

  it("rejects line mutations when status is ISSUED", () => {
    assert.throws(
      () => svc.assertDraftForLineMutation({ status: KiorlyInvoiceStatus.ISSUED }),
      (e: Error) => e.message.includes("Cannot modify lines"),
    );
  });

  it("allows line mutations only for DRAFT", () => {
    assert.doesNotThrow(() => svc.assertDraftForLineMutation({ status: KiorlyInvoiceStatus.DRAFT }));
  });

  it("formats invoice numbers with zero-padded sequence", () => {
    assert.equal(formatKiorlyInvoiceNumber("eg", 2027, 123), "KIO-EG-2027-000123");
  });
});