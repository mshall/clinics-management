import { useMutation } from "@tanstack/react-query";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceDto } from "@/lib/api-types";
import { clinicInvoiceLogoUrl, useCreateInvoiceMutation } from "@/lib/invoice-hooks";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";
import { InvoiceDocumentPreview, printInvoiceElement } from "@/features/invoices/invoice-document-preview";

type InvoiceLineDraft = { purpose: string; amountPaid: string };

type GenerateInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName: string;
  clinicId: string;
  encounterId?: string;
  operationId?: string;
  defaultPurpose?: string;
  defaultAmount?: number;
};

export function GenerateInvoiceDialog({
  open,
  onOpenChange,
  patientName,
  clinicId,
  encounterId,
  operationId,
  defaultPurpose = "",
  defaultAmount,
}: GenerateInvoiceDialogProps) {
  const { t, i18n } = useTranslation();
  const previewId = useId().replace(/:/g, "");
  const createMut = useCreateInvoiceMutation();
  const logo = useAuthenticatedImage(clinicInvoiceLogoUrl(clinicId), open);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([{ purpose: defaultPurpose, amountPaid: defaultAmount != null ? String(defaultAmount) : "" }]);
  const [generated, setGenerated] = useState<InvoiceDto | null>(null);

  useEffect(() => {
    if (!open) return;
    setGenerated(null);
    setLines([{ purpose: defaultPurpose, amountPaid: defaultAmount != null ? String(defaultAmount) : "" }]);
  }, [open, defaultPurpose, defaultAmount]);

  const addLine = () => setLines((prev) => [...prev, { purpose: "", amountPaid: "" }]);
  const removeLine = (idx: number) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const submit = useMutation({
    mutationFn: async () => {
      const payload = lines.map((l) => ({
        purpose: l.purpose.trim(),
        amountPaid: Number.parseFloat(l.amountPaid),
      }));
      if (payload.some((l) => !l.purpose)) throw new Error(t("invoices.purposeRequired", "Each line needs a purpose"));
      if (payload.some((l) => !Number.isFinite(l.amountPaid) || l.amountPaid < 0)) {
        throw new Error(t("invoices.amountInvalid", "Enter a valid amount for each line"));
      }
      return createMut.mutateAsync({
        encounterId,
        operationId,
        lines: payload,
      });
    },
    onSuccess: (inv) => {
      setGenerated(inv);
      toast.success(t("invoices.generated", "Invoice generated"));
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("invoices.generateTitle", "Generate invoice")}</DialogTitle>
        </DialogHeader>

        {generated ? (
          <div className="space-y-4">
            <div id={previewId}>
              <InvoiceDocumentPreview
                invoice={generated}
                language={i18n.language}
                logoUrl={logo.url}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => printInvoiceElement(previewId, generated.invoiceNumber) || toast.error(t("invoices.printBlocked", "Allow pop-ups to print"))}
              >
                <Printer className="me-2 h-4 w-4" />
                {t("invoices.print", "Print")}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.close", "Close")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">{t("invoices.patient", "Patient")}</Label>
              <p className="font-medium">{patientName}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("invoices.lineItems", "Line items")}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="me-1 h-4 w-4" />
                  {t("invoices.addLine", "Add line")}
                </Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={`inv-purpose-${idx}`}>{t("invoices.purpose", "Purpose")}</Label>
                    <Input
                      id={`inv-purpose-${idx}`}
                      value={line.purpose}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, purpose: e.target.value } : l)))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`inv-amount-${idx}`}>{t("invoices.amountPaid", "Amount paid")}</Label>
                    <Input
                      id={`inv-amount-${idx}`}
                      className="ltr-nums"
                      inputMode="decimal"
                      value={line.amountPaid}
                      onChange={(e) =>
                        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, amountPaid: e.target.value } : l)))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    disabled={lines.length <= 1}
                    onClick={() => removeLine(idx)}
                    aria-label={t("invoices.removeLine", "Remove line")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={submit.isPending || createMut.isPending} onClick={() => submit.mutate()}>
                {t("invoices.generate", "Generate invoice")}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
