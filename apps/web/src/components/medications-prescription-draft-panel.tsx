import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AddMedForm, ComposerEmpty, ComposerHint, ComposerModeTabs, ComposerPanel, GenerateBar, MedLine, RxDropzone, RxFileRow, RxPreview } from "@/features/prescriptions/composer-kit";
import { documentViewActionLabel } from "@/lib/document-view-label";
import { generatePrescriptionPng } from "@/lib/prescription-image";
import { loadPrescriptionBranding } from "@/lib/prescription-branding";

export type MedTab = "none" | "manual" | "prescription";

export type PendingMedication = {
  id: string;
  drugName: string;
  dosage: string;
  frequency: string;
};

export type ExistingPrescriptionDoc = {
  id: string;
  originalFileName: string;
  mimeType?: string | null;
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
  /** Pending prescription files not yet saved to the server (create flow, or edit before upload). */
  prescriptionFiles: File[];
  onPrescriptionFilesChange: (files: File[]) => void;
  generatedPrescriptionFile: File | null;
  onGeneratedPrescriptionFileChange: (file: File | null) => void;
  prescriptionContext: PrescriptionContext;
  /** Already-saved prescription documents (edit flow). */
  existingPrescriptions?: ExistingPrescriptionDoc[];
  onViewExisting?: (docId: string) => void;
  onReplaceExisting?: (docId: string) => void;
  onRemoveExisting?: (docId: string) => void;
  existingBusy?: boolean;
  /** When set, picking files calls this instead of only buffering locally (immediate upload on edit). */
  onPickPrescriptionFiles?: (files: File[]) => void;
  uploadDisabled?: boolean;
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
  prescriptionFiles,
  onPrescriptionFilesChange,
  generatedPrescriptionFile,
  onGeneratedPrescriptionFileChange,
  prescriptionContext,
  existingPrescriptions = [],
  onViewExisting,
  onReplaceExisting,
  onRemoveExisting,
  existingBusy,
  onPickPrescriptionFiles,
  uploadDisabled,
  className,
}: MedicationsPrescriptionDraftPanelProps) {
  const { t, i18n } = useTranslation();
  const prescriptionFileRef = useRef<HTMLInputElement>(null);
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const pendingRxCount =
    prescriptionFiles.length + (generatedPrescriptionFile && medTab === "prescription" ? 1 : 0);
  const rxCount = existingPrescriptions.length + pendingRxCount;

  const selectMedTab = (tab: MedTab) => {
    if (tab === medTab) return;
    if (tab === "none") {
      onPrescriptionFilesChange([]);
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
      onMedTabChange("prescription");
    } finally {
      setGenerating(false);
    }
  };

  const onFilesPicked = (list: FileList | null) => {
    const picked = list ? [...list] : [];
    if (!picked.length) return;
    if (onPickPrescriptionFiles) {
      onPickPrescriptionFiles(picked);
      return;
    }
    onPrescriptionFilesChange([...prescriptionFiles, ...picked]);
    onGeneratedPrescriptionFileChange(null);
    if (generatedPreview) URL.revokeObjectURL(generatedPreview);
    setGeneratedPreview(null);
  };

  return (
    <div className={className}>
      <Label className="mb-2 block">{t("encounters.medications")}</Label>
      <Tabs value={medTab} onValueChange={(v) => selectMedTab(v as MedTab)}>
        <ComposerModeTabs medCount={medications.length} rxCount={rxCount} />

        <TabsContent value="none">
          <ComposerPanel>
            <ComposerHint>
              {t("encounters.noMedsTabHint", "No medications were prescribed for this visit. Switch to Manual or Prescription tabs to add entries.")}
            </ComposerHint>
          </ComposerPanel>
        </TabsContent>

        <TabsContent value="manual">
          <ComposerPanel>
            {medications.length > 0 ? (
              <ul className="space-y-2">
                {medications.map((m) => (
                  <MedLine
                    key={m.id}
                    name={m.drugName}
                    dosage={m.dosage}
                    frequency={m.frequency}
                    removeLabel={t("common.remove")}
                    onRemove={() => onMedicationsChange(medications.filter((x) => x.id !== m.id))}
                  />
                ))}
              </ul>
            ) : (
              <ComposerEmpty>{t("encounters.noMedsYet")}</ComposerEmpty>
            )}
            {medications.length > 0 ? <GenerateBar onGenerate={() => void generatePrescription()} pending={generating} label={t("encounters.generatePrescription")} hint={t("encounters.generatePrescriptionHint")} /> : null}
            {generatedPreview ? (
              <RxPreview
                url={generatedPreview}
                title={t("encounters.generatedPrescription")}
                downloadName={`prescription-${prescriptionContext.patientMrn ?? "draft"}.png`}
                downloadLabel={t("encounters.downloadFile")}
                printLabel={t("encounters.printPrescription")}
                onPrint={() => {
                  const ok = printPrescriptionImage(generatedPreview, t("encounters.generatedPrescription"));
                  if (!ok) toast.error(t("encounters.printBlocked", "Allow pop-ups to print the prescription."));
                }}
              />
            ) : null}
            <AddMedForm>
              <div className="space-y-1.5">
                <Label required>{t("encounters.drugName")}</Label>
                <Input value={drugName} onChange={(e) => setDrugName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("encounters.dosage")}</Label>
                <Input value={dosage} onChange={(e) => setDosage(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("encounters.frequency")}</Label>
                <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button type="button" className="w-full" onClick={addMedication} disabled={!drugName.trim()}>
                  {t("encounters.addMed")}
                </Button>
              </div>
            </AddMedForm>
          </ComposerPanel>
        </TabsContent>

        <TabsContent value="prescription">
          <ComposerPanel>
            <input
              ref={prescriptionFileRef}
              type="file"
              multiple
              accept="application/pdf,image/*,text/plain"
              className="hidden"
              onChange={(e) => {
                onFilesPicked(e.target.files);
                e.target.value = "";
              }}
            />
            <RxDropzone
              disabled={uploadDisabled}
              onPick={() => prescriptionFileRef.current?.click()}
              title={t("encounters.uploadPrescription", "Upload prescription")}
              hint={t("encounters.prescriptionUploadHint")}
            />
            {existingPrescriptions.length > 0 || prescriptionFiles.length > 0 || generatedPrescriptionFile ? (
              <ul className="space-y-2" data-testid="operation-prescription-list">
                {existingPrescriptions.map((d) => (
                  <RxFileRow
                    key={d.id}
                    name={d.originalFileName}
                    viewLabel={documentViewActionLabel(d.originalFileName, d.mimeType, t)}
                    replaceLabel={t("encounters.replaceDoc", "Replace")}
                    removeLabel={t("common.remove")}
                    busy={existingBusy}
                    onView={onViewExisting ? () => onViewExisting(d.id) : undefined}
                    onReplace={onReplaceExisting ? () => onReplaceExisting(d.id) : undefined}
                    onRemove={onRemoveExisting ? () => onRemoveExisting(d.id) : undefined}
                  />
                ))}
                {prescriptionFiles.map((file, index) => (
                  <RxFileRow
                    key={`pending-${file.name}-${file.size}-${index}`}
                    name={file.name}
                    viewLabel={t("encounters.viewDoc")}
                    replaceLabel={t("encounters.replaceDoc", "Replace")}
                    removeLabel={t("common.remove")}
                    onRemove={() => onPrescriptionFilesChange(prescriptionFiles.filter((_, i) => i !== index))}
                  />
                ))}
                {generatedPrescriptionFile ? (
                  <RxFileRow
                    key="generated"
                    name={generatedPrescriptionFile.name}
                    viewLabel={t("encounters.viewDoc")}
                    replaceLabel={t("encounters.replaceDoc", "Replace")}
                    removeLabel={t("common.remove")}
                    onRemove={() => {
                      onGeneratedPrescriptionFileChange(null);
                      if (generatedPreview) URL.revokeObjectURL(generatedPreview);
                      setGeneratedPreview(null);
                    }}
                  />
                ) : null}
              </ul>
            ) : (
              <ComposerEmpty icon={<FileUp className="h-5 w-5" />}>{t("encounters.noPrescriptionYet")}</ComposerEmpty>
            )}
          </ComposerPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function resetMedicationsPrescriptionDraft() {
  return {
    medTab: "none" as MedTab,
    medications: [] as PendingMedication[],
    prescriptionFiles: [] as File[],
    generatedPrescriptionFile: null as File | null,
  };
}
