import type { InvoiceDto } from "@/lib/api-types";
import { invoiceBackgroundHex } from "@/lib/invoice-config";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { cn } from "@/lib/utils";

type InvoiceDocumentPreviewProps = {
  invoice: InvoiceDto;
  language: string;
  className?: string;
  logoUrl?: string | null;
};

export function InvoiceDocumentPreview({ invoice, language, className, logoUrl }: InvoiceDocumentPreviewProps) {
  const locale = localeForLanguage(language);
  const rtl = language === "ar";
  const bg = invoiceBackgroundHex(invoice.backgroundColor);
  const sections = new Set(invoice.sections);
  const resolvedLogo = logoUrl ?? null;

  return (
    <div
      className={cn("mx-auto w-full max-w-[210mm] rounded-md border shadow-sm print:shadow-none", className)}
      style={{ backgroundColor: bg }}
      dir={rtl ? "rtl" : "ltr"}
    >
      <div className="space-y-6 p-6 text-sm sm:p-8">
        {sections.has("clinicHeader") ? (
          <header className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-bold">{rtl ? invoice.clinicNameAr : invoice.clinicNameEn}</h2>
              <p className="text-muted-foreground">{rtl ? invoice.clinicAddressAr : invoice.clinicAddressEn}</p>
              <p className="text-muted-foreground ltr-nums">
                {invoice.clinicPhone} · {invoice.clinicEmail}
              </p>
            </div>
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt=""
                className="h-16 max-w-[180px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </header>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {sections.has("patientDetails") ? (
            <section className="rounded-md border border-border/50 bg-background/40 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {rtl ? "بيانات المريض" : "Patient details"}
              </h3>
              <p className="font-medium">{invoice.patientName}</p>
              {invoice.patientMrn ? (
                <p className="text-muted-foreground ltr-nums">
                  {rtl ? "رقم الملف" : "MRN"}: {invoice.patientMrn}
                </p>
              ) : null}
            </section>
          ) : null}

          {sections.has("invoiceMeta") ? (
            <section className="rounded-md border border-border/50 bg-background/40 p-4 sm:text-end">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {rtl ? "بيانات الفاتورة" : "Invoice details"}
              </h3>
              <p>
                <span className="text-muted-foreground">{rtl ? "رقم الفاتورة" : "Invoice #"}: </span>
                <span className="font-mono font-medium ltr-nums">{invoice.invoiceNumber}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{rtl ? "التاريخ" : "Date"}: </span>
                <span className="ltr-nums">{new Date(invoice.issueDate).toLocaleDateString(locale)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{rtl ? "العملة" : "Currency"}: </span>
                <span className="ltr-nums">{invoice.currency}</span>
              </p>
            </section>
          ) : null}
        </div>

        {sections.has("lineItems") ? (
          <section>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  <th className="px-3 py-2 text-start font-semibold">{rtl ? "#" : "#"}</th>
                  <th className="px-3 py-2 text-start font-semibold">{rtl ? "الغرض / الخدمة" : "Purpose / service"}</th>
                  <th className="px-3 py-2 text-end font-semibold">{rtl ? "المبلغ المدفوع" : "Amount paid"}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, idx) => (
                  <tr key={line.id} className="border-b border-border/60">
                    <td className="px-3 py-2 ltr-nums">{idx + 1}</td>
                    <td className="px-3 py-2">{line.purpose}</td>
                    <td className="px-3 py-2 text-end ltr-nums">
                      {formatMoneyAmount(line.amountPaid, invoice.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {sections.has("totals") ? (
          <section className="flex justify-end">
            <div className="min-w-[220px] rounded-md border border-border/60 bg-background/50 p-4">
              <div className="flex items-center justify-between gap-4 font-semibold">
                <span>{rtl ? "الإجمالي" : "Total"}</span>
                <span className="ltr-nums">{formatMoneyAmount(invoice.totalAmount, invoice.currency, locale)}</span>
              </div>
            </div>
          </section>
        ) : null}

        {sections.has("footer") ? (
          <footer className="border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
            <p>{rtl ? "شكراً لثقتكم بنا" : "Thank you for choosing our clinic."}</p>
            <p className="mt-1 ltr-nums">
              {rtl ? "ترخيص" : "License"}: {invoice.clinicLicenseNumber}
            </p>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function printInvoiceElement(elementId: string, title: string): boolean {
  const el = document.getElementById(elementId);
  if (!el) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  const safeTitle = title.replace(/[<>&"]/g, "");
  win.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
<style>@page{margin:10mm}body{margin:0;font-family:system-ui,sans-serif}
.invoice-root{max-width:210mm;margin:0 auto}</style></head>
<body><div class="invoice-root">${el.innerHTML}</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`);
  win.document.close();
  return true;
}
