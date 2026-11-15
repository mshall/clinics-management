/** Egypt ETA e-receipt display — logo only when clinic enables it (issued name on invoice matches TRN). */
export type EtaReceiptViewDto = {
  id: string;
  status: string;
  etaUuid: string | null;
  submittedAt: string | null;
  clinic: {
    nameEn: string;
    nameAr: string;
    addressEn: string;
    addressAr: string;
    phone: string;
    email: string;
    taxRegistrationNumber: string | null;
    licenseNumber: string;
    logoUrl: string | null;
    showLogo: boolean;
  };
  lineDescription: string;
  totalAmount: number;
  currency: string;
  vatPercent: number;
  patientLabel: string;
  issuerRin: string;
  branchCode: string;
  taxpayerActivityCode: string;
  itemCode: string | null;
  qrPayload: string;
};

export function buildEtaReceiptQrPayload(parts: {
  etaUuid: string | null;
  issuerRin: string;
  totalAmount: number;
  currency: string;
  submittedAt: string | null;
}): string {
  if (parts.etaUuid) {
    return `https://invoicing.eta.gov.eg/receipts/${encodeURIComponent(parts.etaUuid)}`;
  }
  return JSON.stringify({
    rin: parts.issuerRin,
    total: parts.totalAmount,
    currency: parts.currency,
    at: parts.submittedAt,
  });
}