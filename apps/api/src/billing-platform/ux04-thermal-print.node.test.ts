import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildThermalPaymentReceiptPdf,
  buildThermalQueueTicketPdf,
  listThermalPrinterProfiles,
  pdfMediaBoxWidth,
  resolveThermalProfile,
  THERMAL_PRINTER_PROFILES,
} from "./thermal-templates";

describe("UX-04 thermal 80 mm templates", () => {
  it("prints correctly for Epson TM-T20III and Star TSP143III (80 mm MediaBox)", () => {
    const profiles = listThermalPrinterProfiles();
    assert.equal(profiles.length, 2);
    assert.ok(profiles.every((p) => p.paperWidthMm === 80 && p.pdfWidthPt === 226.77));

    for (const id of Object.keys(THERMAL_PRINTER_PROFILES) as (keyof typeof THERMAL_PRINTER_PROFILES)[]) {
      const profile = resolveThermalProfile(id);
      assert.equal(profile.id, id);

      const ticket = buildThermalQueueTicketPdf({
        clinicNameEn: "Demo Clinic",
        clinicNameAr: "عيادة تجريبية",
        ticketNumber: 42,
        locale: "ar",
      });
      const receipt = buildThermalPaymentReceiptPdf({
        clinicNameEn: "Demo Clinic",
        clinicNameAr: "عيادة تجريبية",
        receiptNumber: "R-1",
        patientName: "Mona",
        lines: [{ label: "Visit", amount: "300.00" }],
        total: "300.00",
        currency: "EGP",
        method: "CASH",
        locale: "en",
      });

      assert.equal(pdfMediaBoxWidth(ticket), 226.77, `${id} ticket width`);
      assert.equal(pdfMediaBoxWidth(receipt), 226.77, `${id} receipt width`);
      assert.match(ticket.toString("latin1"), /%PDF/);
      assert.match(receipt.toString("latin1"), /%PDF/);
    }
  });
});
