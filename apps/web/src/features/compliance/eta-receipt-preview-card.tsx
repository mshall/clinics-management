import { useTranslation } from "react-i18next";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";

export type EtaReceiptView = {
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

export function EtaReceiptPreviewCard({ receipt, isAr }: { receipt: EtaReceiptView; isAr: boolean }) {
  const { t } = useTranslation();
  const logo = useAuthenticatedImage(receipt.clinic.logoUrl, Boolean(receipt.clinic.logoUrl));
  const vat = receipt.totalAmount * (receipt.vatPercent / 100);
  const totalWithVat = receipt.totalAmount + vat;

  return (
    <article className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 shadow-lg">
      <header className="border-b border-border/60 bg-primary/5 px-6 py-4 text-center">
        {receipt.clinic.showLogo && logo.url ? (
          <img src={logo.url} alt="" className="mx-auto mb-3 h-14 max-w-[200px] object-contain" />
        ) : null}
        <h2 className="text-lg font-bold">{isAr ? receipt.clinic.nameAr : receipt.clinic.nameEn}</h2>
        <p className="text-xs text-muted-foreground">{isAr ? receipt.clinic.addressAr : receipt.clinic.addressEn}</p>
        <p className="mt-1 text-xs ltr-nums">
          {t("compliance.etaTrn", "TRN")}: {receipt.issuerRin} · {receipt.clinic.licenseNumber}
        </p>
      </header>
      <h3 className="mt-6 text-center text-sm font-semibold tracking-wide text-primary">
        {t("compliance.etaReceiptTitle", "Electronic tax receipt")}
      </h3>
      <dl className="px-6 py-4 text-sm">
        <div className="flex justify-between gap-4 py-1">
          <dt className="text-muted-foreground">{t("compliance.etaPatient", "Patient")}</dt>
          <dd className="font-medium">{receipt.patientLabel}</dd>
        </div>
        <div className="flex justify-between gap-4 py-1">
          <dt className="text-muted-foreground">{t("compliance.etaService", "Service")}</dt>
          <dd className="text-end">{receipt.lineDescription}</dd>
        </div>
        {receipt.itemCode ? (
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-muted-foreground">{t("compliance.etaItemCode", "Item code")}</dt>
            <dd className="ltr-nums font-mono text-xs">{receipt.itemCode}</dd>
          </div>
        ) : null}
        <div className="mt-3 border-t border-dashed border-border pt-3">
          <div className="flex justify-between">
            <span>{t("invoices.subtotal", "Subtotal")}</span>
            <span className="ltr-nums font-medium">
              {receipt.totalAmount.toFixed(2)} {receipt.currency}
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("invoices.vat", "VAT")} ({receipt.vatPercent}%)</span>
            <span className="ltr-nums">{vat.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between text-base font-bold">
            <span>{t("invoices.total", "Total")}</span>
            <span className="ltr-nums">
              {totalWithVat.toFixed(2)} {receipt.currency}
            </span>
          </div>
        </div>
      </dl>
      <footer className="border-t border-border bg-muted/30 px-6 py-4 text-center text-xs text-muted-foreground">
        <p className="ltr-nums">UUID: {receipt.etaUuid ?? "—"}</p>
        <p>{receipt.status}</p>
        <p className="mt-2 break-all font-mono text-[10px] opacity-70">{receipt.qrPayload}</p>
      </footer>
    </article>
  );
}