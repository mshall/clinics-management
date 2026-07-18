import { Ban, FileText, FileUp, Pill, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generatePrescriptionPng } from "@/lib/prescription-image";
import { loadPrescriptionBranding } from "@/lib/prescription-branding";
import { cn } from "@/lib/utils";

export type MedTab = "none" | "manual" | "prescription";

export type PendingMedication = {
  id: string;
  drugName: string;
  dosage: string;
  frequency: string;
};

export function emptyPendingMedication(): PendingMedication {
  return { id: crypto.randomUUID(), drugName: "", dosage: "", frequency: "" };
}

export type PrescriptionContext = {
  clinicId: string;
  clinicName: string;
  patientName: string;
  patientMrn?: string | null;
  physicianName?: string | null;
};

type MedicationsPrescriptionDraftPanelProps = {
  medTab: MedTab;
  onMedTabChange: (tab: MedTab) => void;
  medications: PendingMedication[];
  onMedicationsChange: (meds: PendingMedication[]) => void;
  prescriptionFile: File | null;
  onPrescriptionFileChange: (file: File | null) => void;
  generatedPrescriptionFile: File | null;
  onGeneratedPrescriptionFileChange: (file: File | null) => void;
  prescriptionContext: PrescriptionContext;
  className?: string;
};

function printPrescriptionImage(imageUrl: string, title: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const safeTitle = title.replace(/[<>&"]/g, "");
  win.document.write(
    `<!DOCTYPE html><html><head><title>${safeTitle}</title></head><body style="margin:0;display:flex;justify-content:center;"><img src="${imageUrl}" style="max-width:100%;height:auto;" onload="window.print();" /></body></html>`,
  );
  win.document.close();
  return true;
}

export function MedicationsPrescriptionDraftPanel({
  medTab,
  onMedTabChange,
  medications,
  onMedicationsChange,
  prescriptionFile,
  onPrescriptionFileChange,
  generatedPrescriptionFile,
  onGeneratedPrescriptionFileChange,
  prescriptionContext,
  className,
}: MedicationsPrescriptionDraftPanelProps) {
  const { t, i18n } = useTranslation();
  const prescriptionFileRef = useRef<HTMLInputElement>(null);
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const selectMedTab = (tab: MedTab) => {
    if (tab === medTab) return;
    if (tab === "none") {
      onPrescriptionFileChange(null);
      onGeneratedPrescriptionFileChange(null);
      if (generatedPreview) URL.revokeObjectURL(generatedPreview);
      setGeneratedPreview(null);
      onMedicationsChange([]);
    }
    onMedTabChange(tab);
  };

  const addMedication = () => {
    const name = drugName.trim();
    if (!name) return;
    onMedicationsChange([
      ...medications,
      { id: crypto.randomUUID(), drugName: name, dosage: dosage.trim(), frequency: frequency.trim() },
    ]);
    setDrugName("");
    setDosage("");
    setFrequency("");
  };

  const generatePrescription = async () => {
    if (medications.length === 0) return;
    setGenerating(true);
    try {
      const locale = i18n.language === "ar" ? "ar" : "en";
      const branding = prescriptionContext.clinicId
        ? await loadPrescriptionBranding(prescriptionContext.clinicId, locale)
        : undefined;
      const blob = await generatePrescriptionPng({
        clinicName: prescriptionContext.clinicName,
        patientName: prescriptionContext.patientName,
        patientMrn: prescriptionContext.patientMrn,
        date: new Date(),
        medications: medications.map((m) => ({
          id: m.id,
          drugName: m.drugName,
          dosage: m.dosage || null,
          route: null,
          frequency: m.frequency || null,
          duration: null,
          instructions: null,
        })),
        physicianName: prescriptionContext.physicianName ?? undefined,
        rtl: locale === "ar",
        branding,
        labels: {
          title: t("encounters.generatedPrescription"),
          patient: t("encounters.patient"),
          mrn: t("patients.mrn"),
          date: t("expenses.date"),
          medications: t("encounters.medications"),
          signature: t("encounters.prescriptionSignature", "Physician"),
        },
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const file = new File([blob], `prescription-generated-${stamp}.png`, { type: "image/png" });
      if (generatedPreview) URL.revokeObjectURL(generatedPreview);
      setGeneratedPreview(URL.createObjectURL(blob));
      onGeneratedPrescriptionFileChange(file);
      onPrescriptionFileChange(null);
      onMedTabChange("prescription");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={className}>
      <Label className="mb-2 block">{t("encounters.medications")}</Label>
      <Tabs value={medTab} onValueChange={(v) => selectMedTab(v as MedTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
          <TabsTrigger
            value="none"
            className="gap-1.5 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-slate-100"
          >
            <Ban className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t("encounters.medModeNone")}</span>
            <span className="sm:hidden">{t("encounters.medTabNoneShort", "None")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="gap-1.5 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-950 dark:data-[state=active]:bg-emerald-950 dark:data-[state=active]:text-emerald-50"
          >
            <Pill className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t("encounters.medModeManual")}</span>
            <span className="sm:hidden">{t("encounters.medTabManualShort", "Manual")}</span>
            {medications.length > 0 ? (
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                {medications.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="prescription"
            className="gap-1.5 data-[state=active]:bg-violet-100 data-[state=active]:text-violet-950 dark:data-[state=active]:bg-violet-950 dark:data-[state=active]:text-violet-50"
          >
            <FileUp className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t("encounters.medModePrescription")}</span>
            <span className="sm:hidden">{t("encounters.medTabRxShort", "Rx")}</span>
            {(prescriptionFile || generatedPrescriptionFile) && medTab === "prescription" ? (
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                1
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="none" className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
          <p className="text-sm text-muted-foreground">
            {t(
              "encounters.noMedsTabHint",
              "No medications were prescribed for this visit. Switch to Manual or Prescription tabs to add entries.",
            )}
          </p>
        </TabsContent>

        <TabsContent
          value="manual"
          className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20"
        >
          <ul className="space-y-2 text-sm">
            {medications.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5"
              >
                <div className="min-w-0">
                  <span className="font-medium">{m.drugName}</span>
                  {m.dosage ? <span className="text-muted-foreground"> · {m.dosage}</span> : null}
                  {m.frequency ? <span className="text-muted-foreground"> · {m.frequency}</span> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onMedicationsChange(medications.filter((x) => x.id !== m.id))}
                >
                  {t("common.remove")}
                </Button>
              </li>
            ))}
            {medications.length === 0 ? <li className="text-muted-foreground">{t("encounters.noMedsYet")}</li> : null}
          </ul>
          {medications.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2"
                  disabled={generating}
                  onClick={() => void generatePrescription()}
                >
                  <FileText className="h-4 w-4 shrink-0" aria-hidden />
                  {t("encounters.generatePrescription")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("encounters.generatePrescriptionHint")}</p>
              </div>
              {generatedPreview ? (
                <div className="rounded-xl border border-emerald-300/80 bg-background p-3 dark:border-emerald-800">
                  <p className="mb-2 text-sm font-medium">{t("encounters.generatedPrescription")}</p>
                  <img
                    src={generatedPreview}
                    alt={t("encounters.generatedPrescription")}
                    className="mx-auto max-h-[min(50vh,420px)] w-full rounded-md border border-border object-contain"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={generatedPreview} download={`prescription-${prescriptionContext.patientMrn ?? "draft"}.png`}>
                        {t("encounters.downloadFile")}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        const ok = printPrescriptionImage(generatedPreview, t("encounters.generatedPrescription"));
                        if (!ok) {
                          toast.error(t("encounters.printBlocked", "Allow pop-ups to print the prescription."));
                        }
                      }}
                    >
                      <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("encounters.printPrescription")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label required>{t("encounters.drugName")}</Label>
              <Input value={drugName} onChange={(e) => setDrugName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("encounters.dosage")}</Label>
              <Input value={dosage} onChange={(e) => setDosage(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("encounters.frequency")}</Label>
              <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={addMedication} disabled={!drugName.trim()}>
                {t("encounters.addMed")}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="prescription"
          className="rounded-xl border border-violet-200/80 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20"
        >
          <input
            ref={prescriptionFileRef}
            type="file"
            accept="application/pdf,image/*,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              onPrescriptionFileChange(f);
              if (f) {
                onGeneratedPrescriptionFileChange(null);
                if (generatedPreview) URL.revokeObjectURL(generatedPreview);
                setGeneratedPreview(null);
              }
            }}
          />
          <button
            type="button"
            onClick={() => prescriptionFileRef.current?.click()}
            className={cn(
              "mb-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors",
              "border-violet-300 bg-violet-50/50 text-violet-900 hover:border-violet-400 hover:bg-violet-50",
              "dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/50",
            )}
          >
            <FileUp className="h-8 w-8 text-violet-500 dark:text-violet-400" aria-hidden />
            <span className="font-medium">{t("encounters.uploadPrescription", "Upload prescription")}</span>
            <span className="text-xs text-violet-700/80 dark:text-violet-300/80">{t("encounters.prescriptionUploadHint")}</span>
          </button>
          <ul className="space-y-2 text-sm">
            {prescriptionFile ? (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
                <span className="truncate font-medium">{prescriptionFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onPrescriptionFileChange(null)}
                >
                  {t("common.remove")}
                </Button>
              </li>
            ) : generatedPrescriptionFile ? (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
                <span className="truncate font-medium">{generatedPrescriptionFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    onGeneratedPrescriptionFileChange(null);
                    if (generatedPreview) URL.revokeObjectURL(generatedPreview);
                    setGeneratedPreview(null);
                  }}
                >
                  {t("common.remove")}
                </Button>
              </li>
            ) : (
              <li className="text-muted-foreground">{t("encounters.noPrescriptionYet")}</li>
            )}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function resetMedicationsPrescriptionDraft() {
  return {
    medTab: "none" as MedTab,
    medications: [] as PendingMedication[],
    prescriptionFile: null as File | null,
    generatedPrescriptionFile: null as File | null,
  };
}
