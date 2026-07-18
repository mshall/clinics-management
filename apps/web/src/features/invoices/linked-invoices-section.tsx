import { FileText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceDocumentPreview, printInvoiceElement } from "@/features/invoices/invoice-document-preview";
import type { InvoiceListItemDto } from "@/lib/api-types";
import { clinicInvoiceLogoUrl, useInvoiceQuery, useInvoicesQuery } from "@/lib/invoice-hooks";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";
import { cn } from "@/lib/utils";

type LinkedInvoicesSectionProps = {
  encounterId?: string;
  operationId?: string;
  clinicId?: string | null;
  className?: string;
};

export function LinkedInvoicesSection({
  encounterId,
  operationId,
  clinicId,
  className,
}: LinkedInvoicesSectionProps) {
  const { t, i18n } = useTranslation();
  const enabled = Boolean(encounterId || operationId);
  const { data: invoices = [], isPending } = useInvoicesQuery({
    encounterId,
    operationId,
    enabled,
  });
  const [viewId, setViewId] = useState<string | null>(null);
  const previewId = encounterId ? `encounter-invoice-${encounterId}` : `operation-invoice-${operationId}`;
  const { data: invoiceDetail } = useInvoiceQuery(viewId ?? undefined);
  const logoClinicId = clinicId ?? invoiceDetail?.clinicId;
  const logo = useAuthenticatedImage(
    logoClinicId ? clinicInvoiceLogoUrl(logoClinicId) : null,
    viewId != null && Boolean(logoClinicId),
  );

  const emptyMessage = operationId
    ? t("invoices.noneForOperation", "No invoices created for this operation yet.")
    : t("invoices.noneForEncounter", "No invoices created for this encounter yet.");

  if (!enabled) return null;

  return (
    <>
      <Card className={cn(className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {t("invoices.title", "Invoices")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {isPending ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : invoices.length === 0 ? (
            <p className="text-muted-foreground">{emptyMessage}</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  locale={localeForLanguage(i18n.language)}
                  onView={() => setViewId(inv.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={viewId != null} onOpenChange={(open) => !open && setViewId(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{invoiceDetail?.invoiceNumber ?? t("invoices.title", "Invoices")}</DialogTitle>
          </DialogHeader>
          {invoiceDetail ? (
            <div className="space-y-4">
              <div id={previewId}>
                <InvoiceDocumentPreview invoice={invoiceDetail} language={i18n.language} logoUrl={logo.url} />
              </div>
              <Button type="button" onClick={() => printInvoiceElement(previewId, invoiceDetail.invoiceNumber) || undefined}>
                {t("invoices.print", "Print")}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InvoiceRow({
  invoice,
  locale,
  onView,
}: {
  invoice: InvoiceListItemDto;
  locale: string;
  onView: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div>
        <p className="font-mono text-xs ltr-nums">{invoice.invoiceNumber}</p>
        <p className="text-xs text-muted-foreground ltr-nums">
          {new Date(invoice.issueDate).toLocaleDateString(locale)} ·{" "}
          {formatMoneyAmount(invoice.totalAmount, invoice.currency, locale)}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onView}>
        {t("invoices.view", "View")}
      </Button>
    </li>
  );
}
