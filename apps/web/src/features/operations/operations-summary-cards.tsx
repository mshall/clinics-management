import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationSummaryDto } from "@/lib/api-types";
import { formatClinicName, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";

type Props = {
  summary: OperationSummaryDto | undefined;
  loading: boolean;
  language: string;
};

export function OperationsSummaryBreakdown({ summary, loading, language }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const loc = localeForLanguage(language);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={loading}>
        {t("operations.summaryBreakdown", "View breakdown")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("operations.summaryBreakdownTitle", "Operations breakdown")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div>
              <h4 className="mb-2 text-sm font-medium">{t("operations.summaryByClinic", "By clinic")}</h4>
              <ResponsiveTable>
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-start font-medium">{t("operations.clinic", "Clinic")}</th>
                      <th className="px-2 py-1.5 text-end font-medium">{t("operations.summaryCount", "Count")}</th>
                      <th className="px-2 py-1.5 text-end font-medium">{t("operations.summaryCollected", "Collected")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.byClinic ?? []).map((c) => (
                      <tr key={`${c.clinicId}-${c.feeCurrency}`} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          {formatClinicName({ nameEn: c.clinicNameEn, nameAr: c.clinicNameAr }, language)}
                        </td>
                        <td className="px-2 py-1.5 text-end ltr-nums">{c.operationCount}</td>
                        <td className="px-2 py-1.5 text-end ltr-nums">
                          {formatMoneyAmount(c.paidTotal, c.feeCurrency, loc)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">{t("operations.summaryRecent", "Operations in period")}</h4>
              <ResponsiveTable>
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-start font-medium">{t("operations.operationDate", "Operation date")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("operations.clinic", "Clinic")}</th>
                      <th className="px-2 py-1.5 text-start font-medium">{t("operations.patient", "Patient")}</th>
                      <th className="px-2 py-1.5 text-end font-medium">{t("operations.paidAmount", "Paid")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary?.operations ?? []).map((op) => (
                      <tr key={op.id} className="border-t border-border">
                        <td className="px-2 py-1.5 ltr-nums whitespace-nowrap">
                          {new Date(op.operationDate).toLocaleDateString(loc)}
                        </td>
                        <td className="px-2 py-1.5">
                          {formatClinicName({ nameEn: op.clinicNameEn, nameAr: op.clinicNameAr }, language)}
                        </td>
                        <td className="px-2 py-1.5">{op.patientLabel}</td>
                        <td className="px-2 py-1.5 text-end ltr-nums">
                          {formatMoneyAmount(op.paidAmount, op.feeCurrency, loc)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
              {(summary?.operations.length ?? 0) >= 300 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("operations.summaryTruncated", "Showing the most recent 300 operations.")}</p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}