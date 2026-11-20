import { AlertTriangle, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OperationStatusBadge } from "@/components/operation-status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationDto } from "@/lib/api-types";
import { formatClinicianDisplayName } from "@/lib/employee-display";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { resolvePatientListLabel } from "@/lib/patient-display";

type OperationDuplicateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: OperationDto[];
  pending?: boolean;
  onConfirmCreate: () => void;
  currencyFallback?: string;
};

function DuplicateItem({
  op,
  locale,
  currencyFallback,
}: {
  op: OperationDto;
  locale: string;
  currencyFallback: string;
}) {
  const { t, i18n } = useTranslation();
  const patient = resolvePatientListLabel({
    patientId: op.patientId,
    patientMrn: op.patientMrn,
    patientName: op.patientName,
  });
  const currency = op.feeCurrency?.trim() || currencyFallback;
  const money = (n: number) => formatMoneyAmount(n, currency, locale);

  return (
    <li className="rounded-md border border-border/80 bg-background px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{patient.text}</p>
          {op.patientMrn ? <p className="text-xs text-muted-foreground ltr-nums">{op.patientMrn}</p> : null}
        </div>
        <OperationStatusBadge status={op.status ?? "BOOKED"} />
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline">{t("operations.operationDate", "Operation date")}: </dt>
          <dd className="inline ltr-nums text-foreground">
            {new Date(op.operationDate).toLocaleString(locale)}
          </dd>
        </div>
        <div>
          <dt className="inline">{t("operations.doctor", "Performing doctor")}: </dt>
          <dd className="inline text-foreground">{formatClinicianDisplayName(op, i18n.language)}</dd>
        </div>
        {op.financialsVisible ? (
          <>
            <div>
              <dt className="inline">{t("operations.totalCostShort", "Total")}: </dt>
              <dd className="inline ltr-nums text-foreground">{money(op.totalCost)}</dd>
            </div>
            <div>
              <dt className="inline">{t("operations.downPaymentShort", "Down payment")}: </dt>
              <dd className="inline ltr-nums text-foreground">{money(op.downPayment)}</dd>
            </div>
          </>
        ) : null}
        {op.comments?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="inline">{t("operations.comments", "Comments")}: </dt>
            <dd className="inline whitespace-pre-wrap text-foreground">{op.comments}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

export function OperationDuplicateDialog({
  open,
  onOpenChange,
  duplicates,
  pending = false,
  onConfirmCreate,
  currencyFallback = "EGP",
}: OperationDuplicateDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        className="flex max-h-[min(90vh,32rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby="operation-duplicate-description"
      >
        <div className="shrink-0 border-b border-border bg-amber-500/10 px-6 py-5">
          <DialogHeader className="space-y-3 text-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-900 ring-4 ring-amber-100/80 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-950/50">
              <Copy className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">
              {t("operations.duplicateTitle", "Existing operation found")}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <p id="operation-duplicate-description" className="shrink-0 text-sm leading-relaxed text-muted-foreground">
            {t(
              "operations.duplicateIntro",
              "It seems there is already a created operation for this patient with this doctor on the same day.",
            )}
          </p>

          {duplicates.length > 0 ? (
            <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/40 px-3 py-3">
              {duplicates.map((op) => (
                <DuplicateItem
                  key={op.id}
                  op={op}
                  locale={locale}
                  currencyFallback={currencyFallback}
                />
              ))}
            </ul>
          ) : null}

          <div className="flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p>
              {t(
                "operations.duplicateConsistencyWarning",
                "Please make sure you don’t create duplicate operations — it helps keep patient records consistent.",
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirmCreate}>
            {t("operations.duplicateConfirmCreate", "Create anyway")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
