import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/http";
import { Printer } from "lucide-react";

type LetterType = "SICK_LEAVE" | "MEDICAL_REPORT" | "REFERRAL" | "FITNESS_CERTIFICATE";

type ClinicalLetter = {
  id: string;
  type: LetterType;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
};

function printLetter(letter: ClinicalLetter, bilingual: boolean) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Popup blocked");
    return;
  }
  const title = letter.titleEn.replace(/[<>&"]/g, "");
  const en = letter.bodyEn.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  const ar = letter.bodyAr.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  const arBlock = bilingual
    ? `<div dir="rtl" lang="ar" style="margin-top:2rem;font-family:system-ui;line-height:1.5"><h2>${letter.titleAr}</h2><p>${ar}</p></div>`
    : "";
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>@page{margin:14mm}body{font-family:system-ui;line-height:1.5;max-width:720px;margin:0 auto;padding:12px}
h1{font-size:1.25rem;margin-bottom:0.5rem}.en{margin-bottom:1rem}</style></head>
<body class="en"><h1>${title}</h1><p>${en}</p>${arBlock}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script></body></html>`);
  win.document.close();
}

type Props = {
  patientId: string;
  encounterId: string;
  disabled?: boolean;
};

export function ClinicalLetterDialog({ patientId, encounterId, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LetterType>("SICK_LEAVE");
  const [days, setDays] = useState("3");
  const [diagnosis, setDiagnosis] = useState("");
  const [referTo, setReferTo] = useState("");
  const [activity, setActivity] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<ClinicalLetter | null>(null);

  const generateMut = useMutation({
    mutationFn: () => {
      const fields: Record<string, string> = { diagnosis, reason: diagnosis, notes };
      if (type === "SICK_LEAVE") fields.days = days;
      if (type === "REFERRAL") fields.referTo = referTo;
      if (type === "FITNESS_CERTIFICATE") fields.activity = activity;
      return apiPost<ClinicalLetter>("/api/v1/clinical/letters", {
        type,
        patientId,
        encounterId,
        fields,
      });
    },
    onSuccess: (letter) => {
      setPreview(letter);
      toast.success(t("clinical.letterGenerated", "Letter generated."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const typeOptions: { value: LetterType; label: string }[] = [
    { value: "SICK_LEAVE", label: t("clinical.letterSickLeave", "Sick leave") },
    { value: "MEDICAL_REPORT", label: t("clinical.letterMedicalReport", "Medical report") },
    { value: "REFERRAL", label: t("clinical.letterReferral", "Referral") },
    { value: "FITNESS_CERTIFICATE", label: t("clinical.letterFitness", "Fitness certificate") },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          {t("clinical.letterGenerate", "Generate letter")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("clinical.letterGenerate", "Generate letter")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t("clinical.letterType", "Letter type")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value as LetterType);
                setPreview(null);
              }}
            >
              {typeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {type === "SICK_LEAVE" ? (
            <div className="space-y-2">
              <Label>{t("clinical.letterSickDays", "Days of leave")}</Label>
              <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
            </div>
          ) : null}
          {type === "REFERRAL" ? (
            <div className="space-y-2">
              <Label>{t("clinical.letterReferTo", "Refer to")}</Label>
              <Input value={referTo} onChange={(e) => setReferTo(e.target.value)} />
            </div>
          ) : null}
          {type === "FITNESS_CERTIFICATE" ? (
            <div className="space-y-2">
              <Label>{t("clinical.letterActivity", "Activity / work")}</Label>
              <Input value={activity} onChange={(e) => setActivity(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label optional>{t("clinical.letterDiagnosis", "Diagnosis / reason")}</Label>
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </div>
          {type === "MEDICAL_REPORT" ? (
            <div className="space-y-2">
              <Label optional>{t("clinical.letterNotes", "Report notes (EN)")}</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          ) : null}
          <Button type="button" disabled={generateMut.isPending} onClick={() => generateMut.mutate()}>
            {t("clinical.letterCreate", "Create letter")}
          </Button>
          {preview ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                {i18n.language.startsWith("ar") ? preview.titleAr : preview.titleEn}
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs">
                {i18n.language.startsWith("ar") ? preview.bodyAr : preview.bodyEn}
              </pre>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1"
                onClick={() => printLetter(preview, true)}
              >
                <Printer className="size-3.5" />
                {t("clinical.letterPrint", "Print (bilingual)")}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
