import { useMutation } from "@tanstack/react-query";
import { MessageCircle, Printer, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Feature } from "@/features/flags/feature";
import { ApiError, apiPost } from "@/lib/http";
import { generatePrescriptionPng } from "@/lib/prescription-image";
import { loadPrescriptionBranding } from "@/lib/prescription-branding";
import { printedItemLabel, type PrintedRxResponse } from "@/lib/prescription-print";

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

  const handoffMutation = useMutation({
    mutationFn: () => apiPost<{ alreadyHandedOff: boolean }>(`/api/v1/encounters/${encounterId}/prescription/handoff`, {}),
    onSuccess: (r) =>
      toast.success(r.alreadyHandedOff ? t("rxShare.alreadyHandedOff", "Already sent to a pharmacy") : t("rxShare.handedOff", "Prescription sent to the pharmacy")),
    onError: (e) =>
      toast.error(
        errorCode(e) === "RX_HANDOFF_NO_CONSENT"
          ? t("rxShare.handoffNoConsent", "The patient has not consented to share prescriptions with a pharmacy.")
          : describe(e),
      ),
  });

  return (
    <div className="kx-callout flex-col" data-tone="good" data-testid="signed-rx-actions">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("rxShare.title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("rxShare.hint")}</p>
        </div>
      </div>
      <div className="flex w-full flex-wrap gap-2">
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
        <Feature flag="clinic.eprescription_handoff">
          <Button type="button" size="sm" variant="outline" disabled={handoffMutation.isPending} onClick={() => handoffMutation.mutate()}>
            {t("rxShare.sendToPharmacy", "Send to pharmacy")}
          </Button>
        </Feature>
      </div>
    </div>
  );
}
