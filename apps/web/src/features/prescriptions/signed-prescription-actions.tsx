import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Printer, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/http";
import { generatePrescriptionPng } from "@/lib/prescription-image";
import { loadPrescriptionBranding } from "@/lib/prescription-branding";

export type PrintedRxItem = {
  brand: string;
  ingredients: string[];
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  instructionsAr: string | null;
};

export type PrintedRxResponse = {
  encounterId: string;
  clinicNameEn: string;
  clinicNameAr: string | null;
  doctorName: string;
  patientName: string;
  signedAt: string;
  items: PrintedRxItem[];
  verifyUrl: string | null;
  expiresAt: string;
};

export function printedItemLabel(item: PrintedRxItem): string {
  const head = [item.brand, item.strength].filter(Boolean).join(" ");
  return item.ingredients.length ? `${head} (${item.ingredients.join(" + ")})` : head;
}

function errorCode(e: unknown): string | null {
  if (e instanceof ApiError && e.body && typeof e.body === "object") {
    const body = e.body as { errorCode?: string };
    return body.errorCode ?? null;
  }
  return null;
}

function openPrintWindow(imageUrl: string, title: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const safeTitle = title.replace(/[<>&"]/g, "");
  win.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
<style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center;align-items:flex-start}
img{max-width:100%;height:auto}</style></head>
<body><img src="${imageUrl}" alt="" onload="window.print();window.onafterprint=function(){window.close()}"/></body></html>`);
  win.document.close();
  return true;
}

type Props = { encounterId: string; clinicId: string };

/** CL-03: print a signed Rx with a pharmacy verification QR, or send it to the patient on WhatsApp. */
export function SignedPrescriptionActions({ encounterId, clinicId }: Props) {
  const { t, i18n } = useTranslation();

  const describe = (e: unknown): string => {
    const code = errorCode(e);
    if (code === "RX_NOT_SIGNED") return t("rxShare.errorNotSigned");
    if (code === "RX_EMPTY") return t("rxShare.errorEmpty");
    if (code === "RX_NO_PHONE") return t("rxShare.errorNoPhone");
    if (code === "MESSAGING_CONSENT_REQUIRED" || code === "SAMPLE_PATIENT_NO_MESSAGES") return t("rxShare.errorConsent");
    return e instanceof Error ? e.message : String(e);
  };

  const printMutation = useMutation({
    mutationFn: async () => {
      const rx = await apiPost<PrintedRxResponse>(`/api/v1/encounters/${encounterId}/prescription/print`, {});
      const rtl = i18n.language === "ar";
      const branding = await loadPrescriptionBranding(clinicId, rtl ? "ar" : "en");
      const blob = await generatePrescriptionPng({
        clinicName: rtl ? rx.clinicNameAr || rx.clinicNameEn : rx.clinicNameEn,
        patientName: rx.patientName,
        date: new Date(rx.signedAt),
        medications: rx.items.map((item, idx) => ({
          id: String(idx),
          drugName: printedItemLabel(item),
          dosage: item.dosage,
          route: null,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructionsAr ?? item.instructions,
        })),
        physicianName: rx.doctorName,
        rtl,
        branding,
        qrPayload: rx.verifyUrl ?? undefined,
        labels: {
          title: t("encounters.generatedPrescription"),
          patient: t("encounters.patient"),
          mrn: t("patients.mrn"),
          date: t("expenses.date"),
          medications: t("encounters.medications"),
          signature: t("encounters.prescriptionSignature", "Physician"),
        },
      });
      return URL.createObjectURL(blob);
    },
    onSuccess: (url) => {
      if (!openPrintWindow(url, t("rxShare.printTitle"))) toast.error(t("encounters.printBlocked"));
    },
    onError: (e) => toast.error(describe(e)),
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiPost<{ outboundMessageId: string; status: string }>(`/api/v1/encounters/${encounterId}/prescription/send`, {}),
    onSuccess: () => toast.success(t("rxShare.sent")),
    onError: (e) => toast.error(describe(e)),
  });

  return (
    <div
      className="rounded-xl border border-emerald-300/80 bg-emerald-50/40 p-3 dark:border-emerald-800 dark:bg-emerald-950/20"
      data-testid="signed-rx-actions"
    >
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
        {t("rxShare.title")}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">{t("rxShare.hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={printMutation.isPending}
          onClick={() => printMutation.mutate()}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          {t("rxShare.print")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {t("rxShare.sendToPatient")}
        </Button>
      </div>
    </div>
  );
}
