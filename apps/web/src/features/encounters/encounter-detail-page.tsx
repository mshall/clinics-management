import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  Eye,
  FileText,
  FileUp,
  FlaskConical,
  Heart,
  Lock,
  Pill,
  Printer,
  Ruler,
  Scale,
  ScanLine,
  Stethoscope,
  Thermometer,
  Trash2,
  Upload,
  Wind,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { DocumentViewerOverlay } from "@/components/document-viewer-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EncounterDeleteConfirmDialog } from "@/features/encounters/encounter-delete-confirm-dialog";
import { GenerateInvoiceDialog } from "@/features/invoices/generate-invoice-dialog";
import { LinkedInvoicesSection } from "@/features/invoices/linked-invoices-section";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { ENCOUNTER_VISIT_TYPES, formatVisitType } from "@/lib/visit-types";
import { useAuthStore } from "@/stores/auth-store";
import { useEncounterQuery, useClinicsQuery } from "@/lib/api-hooks";
import type { EncounterDetailDto, EncounterDocumentDto } from "@/lib/api-types";
import { ApiError, apiDelete, apiFetchBlob, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { canDeleteEncounter } from "@/lib/encounter-delete-policy";
import { formatEncounterStatus, formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount, resolveClinicCurrencyCode } from "@/lib/money-display";
import { generatePrescriptionPng } from "@/lib/prescription-image";
import { loadPrescriptionBranding } from "@/lib/prescription-branding";
import { cn } from "@/lib/utils";

function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
    return String((e.body as { message?: string }).message);
  }
  return e instanceof Error ? e.message : String(e);
}

function printPrescriptionImage(imageUrl: string, title: string): boolean {
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

function encounterStatusLabel(t: TFunction, code: string): string {
  const map: Record<string, string> = {
    DRAFT: t("encounters.statusDraft", "Draft"),
    AMENDED: t("encounters.statusAmended", "Amended"),
    FINALIZED: t("encounters.statusFinalized", "Finalized"),
  };
  return map[code] ?? code;
}

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

type DocKind = "LAB" | "RADIOLOGY" | "PRESCRIPTION";
type MedTab = "none" | "manual" | "prescription";

export function EncounterDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canDelete = canDeleteEncounter(user?.role);
  const { data: enc, isPending, isError, error } = useEncounterQuery(id);
  const { data: clinics = [] } = useClinicsQuery();
  const visitFeeCurrency = resolveClinicCurrencyCode(clinics, enc?.clinicId);

  const [visitType, setVisitType] = useState("");
  const [chief, setChief] = useState("");
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [temperature, setTemperature] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [visitFeeAmount, setVisitFeeAmount] = useState("");
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [noMedications, setNoMedications] = useState(false);
  const [medTab, setMedTab] = useState<MedTab>("manual");
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [noMedsConfirmOpen, setNoMedsConfirmOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [viewer, setViewer] = useState<{ doc: EncounterDocumentDto; url: string; contentType: string } | null>(null);
  const viewerUrlRef = useRef<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const prescriptionFileRef = useRef<HTMLInputElement>(null);
  const pendingReplaceRef = useRef<{ docId: string; kind: DocKind } | null>(null);
  const generatedRxUrlRef = useRef<string | null>(null);
  const [generatedRxPreview, setGeneratedRxPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!enc) return;
    setVisitType(enc.visitType);
    setChief(enc.chiefComplaint ?? "");
    setSubjective(enc.subjective ?? "");
    setObjective(enc.objective ?? "");
    setAssessment(enc.assessment ?? "");
    setPlan(enc.plan ?? "");
    setHeartRate(enc.heartRate != null ? String(enc.heartRate) : "");
    setSpo2(enc.spo2 != null ? String(enc.spo2) : "");
    setBpSys(enc.bpSystolic != null ? String(enc.bpSystolic) : "");
    setBpDia(enc.bpDiastolic != null ? String(enc.bpDiastolic) : "");
    setTemperature(enc.temperature != null ? String(enc.temperature) : "");
    setWeightKg(enc.weightKg != null ? String(enc.weightKg) : "");
    setHeightCm(enc.heightCm != null ? String(enc.heightCm) : "");
    setVisitFeeAmount(enc.visitFeeAmount != null ? String(enc.visitFeeAmount) : "");
    setNoMedications(enc.noMedications ?? false);
    if (enc.noMedications) setMedTab("none");
  }, [enc?.id, enc?.noMedications]);

  useEffect(() => {
    if (generatedRxUrlRef.current) {
      URL.revokeObjectURL(generatedRxUrlRef.current);
      generatedRxUrlRef.current = null;
    }
    setGeneratedRxPreview(null);
  }, [
    enc?.medications
      ?.map((m) => `${m.id}|${m.drugName}|${m.dosage ?? ""}|${m.frequency ?? ""}`)
      .join(";"),
  ]);

  useEffect(() => {
    return () => {
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
      }
      if (generatedRxUrlRef.current) {
        URL.revokeObjectURL(generatedRxUrlRef.current);
        generatedRxUrlRef.current = null;
      }
    };
  }, []);

  const closeViewer = () => {
    if (viewerUrlRef.current) {
      URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = null;
    }
    setViewer(null);
  };

  const draft = enc?.status === "DRAFT" || enc?.status === "AMENDED";
  const canFinalize = Boolean(enc && user && enc.clinicianId === user.id && draft);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["encounter", id] });
    void qc.invalidateQueries({ queryKey: ["encounters"] });
    void qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiPatch<EncounterDetailDto>(`/api/v1/encounters/${id}`, {
        visitType,
        chiefComplaint: chief,
        subjective,
        objective,
        assessment,
        plan,
        vitalsJson: enc?.vitalsJson ?? {},
        heartRate: numOrUndef(heartRate),
        spo2: numOrUndef(spo2),
        bpSystolic: numOrUndef(bpSys),
        bpDiastolic: numOrUndef(bpDia),
        temperature: numOrUndef(temperature),
        weightKg: numOrUndef(weightKg),
        heightCm: numOrUndef(heightCm),
        visitFeeAmount: numOrUndef(visitFeeAmount),
      });
    },
    onSuccess: (data) => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      toast.success(
        t("encounters.savedWithStatus", "Encounter saved. Status: {{status}}.", {
          status: encounterStatusLabel(t, data.status),
        })
      );
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e));
    },
  });

  const addMedMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/encounters/${id}/medications`, {
        drugName,
        dosage: dosage || undefined,
        frequency: frequency || undefined,
      }),
    onSuccess: () => {
      setDrugName("");
      setDosage("");
      setFrequency("");
      setNoMedications(false);
      setMedTab("manual");
      toast.success(t("encounters.medAdded"));
      invalidate();
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e));
    },
  });

  const removeMedMutation = useMutation({
    mutationFn: (mid: string) => apiDelete(`/api/v1/encounters/${id}/medications/${mid}`),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const noMedMutation = useMutation({
    mutationFn: (v: boolean) => apiPatch<EncounterDetailDto>(`/api/v1/encounters/${id}`, { noMedications: v }),
    onSuccess: (data) => {
      setNoMedications(data.noMedications);
      setNoMedsConfirmOpen(false);
      if (data.noMedications) setMedTab("none");
      invalidate();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const selectMedTab = (tab: MedTab) => {
    if (tab === medTab || noMedMutation.isPending) return;
    if (!draft) {
      setMedTab(tab);
      return;
    }
    if (tab === "none") {
      if (noMedications) return;
      const hasData = (enc?.medications?.length ?? 0) > 0 || (enc?.documents?.some((d) => d.kind === "PRESCRIPTION") ?? false);
      if (hasData) {
        setNoMedsConfirmOpen(true);
        return;
      }
      noMedMutation.mutate(true);
      return;
    }
    if (noMedications) {
      noMedMutation.mutate(false, { onSuccess: () => setMedTab(tab) });
      return;
    }
    setMedTab(tab);
  };

  const uploadMutation = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: DocKind }) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      return apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${id}/documents`, fd);
    },
    onSuccess: (_data, variables) => {
      if (variables.kind === "PRESCRIPTION") {
        setNoMedications(false);
        if (!variables.file.name.startsWith("prescription-generated-")) {
          setMedTab("prescription");
        }
      }
      toast.success(t("encounters.docUploaded"));
      invalidate();
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e));
    },
  });

  const generatePrescriptionMutation = useMutation({
    mutationFn: async () => {
      if (!enc || meds.length === 0) throw new Error("No medications");
      const rtl = i18n.language === "ar";
      const locale = rtl ? "ar" : "en";
      const patientResolved = resolvePatientListLabel({
        patientId: enc.patientId,
        patientMrn: enc.patientMrn,
        patientName: enc.patientName,
      });
      const branding = enc.clinicId ? await loadPrescriptionBranding(enc.clinicId, locale) : undefined;
      const blob = await generatePrescriptionPng({
        clinicName: formatClinicNameFields(enc.clinicNameEn, enc.clinicNameAr, i18n.language, enc.clinicId),
        patientName: patientResolved.isIdFallback ? (enc.patientMrn?.trim() || t("encounters.patient")) : patientResolved.text,
        patientMrn: enc.patientMrn,
        date: new Date(),
        medications: meds,
        physicianName: user?.displayName,
        rtl,
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
      if (generatedRxUrlRef.current) URL.revokeObjectURL(generatedRxUrlRef.current);
      const previewUrl = URL.createObjectURL(blob);
      generatedRxUrlRef.current = previewUrl;
      setGeneratedRxPreview(previewUrl);
      await apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${id}/documents`, (() => {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "PRESCRIPTION");
        return fd;
      })());
      return previewUrl;
    },
    onSuccess: () => {
      setNoMedications(false);
      toast.success(t("encounters.prescriptionGenerated"));
      invalidate();
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e));
    },
  });

  const removeDocMutation = useMutation({
    mutationFn: (docId: string) => apiDelete(`/api/v1/encounters/${id}/documents/${docId}`),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const openDocument = async (doc: EncounterDocumentDto) => {
    if (!id) return;
    try {
      const { blob, contentType } = await apiFetchBlob(`/api/v1/encounters/${id}/documents/${doc.id}/file`);
      const url = URL.createObjectURL(blob);
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = url;
      setViewer({ doc, url, contentType });
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e));
    }
  };

  const startReplace = (docId: string, kind: DocKind) => {
    pendingReplaceRef.current = { docId, kind };
    replaceFileRef.current?.click();
  };

  const onReplaceFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const pending = pendingReplaceRef.current;
    pendingReplaceRef.current = null;
    if (!file || !id || !pending) return;
    try {
      await apiDelete(`/api/v1/encounters/${id}/documents/${pending.docId}`);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", pending.kind);
      await apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${id}/documents`, fd);
      toast.success(t("encounters.docReplaced", "Document replaced"));
      invalidate();
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e));
    }
  };

  const finalizeMutation = useMutation({
    mutationFn: () => apiPost<EncounterDetailDto>(`/api/v1/encounters/${id}/finalize`, {}),
    onSuccess: (data) => {
      setFinalizeDialogOpen(false);
      invalidate();
      if (data.appointmentId) {
        void qc.invalidateQueries({ queryKey: ["appointment", data.appointmentId] });
      }
      toast.success(
        t("encounters.finalizedWithStatus", "Encounter finalized. Status: {{status}}.", {
          status: encounterStatusLabel(t, data.status),
        })
      );
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => apiDelete(`/api/v1/encounters/${id}`),
    onSuccess: () => {
      setDeleteDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["revenue"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
      if (enc?.patientId) {
        void qc.invalidateQueries({ queryKey: ["patient", enc.patientId] });
      }
      toast.success(t("encounters.deleteSuccess", "Encounter deleted."));
      navigate("/encounters");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (isPending || !id) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError || !enc) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t("encounters.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-destructive">{isError && error instanceof Error ? error.message : t("encounters.notFound")}</p>
          <Button asChild variant="secondary">
            <Link to="/encounters">{t("encounters.backList")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const labs = enc.documents?.filter((d) => d.kind === "LAB") ?? [];
  const radiology = enc.documents?.filter((d) => d.kind === "RADIOLOGY") ?? [];
  const prescriptions = enc.documents?.filter((d) => d.kind === "PRESCRIPTION") ?? [];
  const meds = enc.medications ?? [];
  const hasMedicationData = meds.length > 0 || prescriptions.length > 0;
  const medsPanelActive = draft ? !noMedications : !enc.noMedications;
  const activeMedTab = medTab;

  return (
    <div className="space-y-6">
      <EncounterDeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        encounter={
          enc
            ? {
                id: enc.id,
                patientName: enc.patientName,
                patientMrn: enc.patientMrn,
                status: enc.status,
                visitType: enc.visitType,
                clinicId: enc.clinicId,
                clinicNameEn: enc.clinicNameEn,
                clinicNameAr: enc.clinicNameAr,
                createdAt: enc.createdAt,
                updatedAt: enc.updatedAt,
                visitFeeAmount: enc.visitFeeAmount,
                visitFeeCurrency,
              }
            : null
        }
        pending={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />

      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent
          className="gap-0 overflow-hidden border-amber-200 p-0 sm:max-w-md dark:border-amber-900/60"
          aria-describedby="encounter-finalize-desc"
        >
          <div className="border-b border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 px-6 py-5 dark:border-amber-900/40 dark:from-amber-950/80 dark:to-orange-950/40">
            <DialogHeader className="space-y-3 text-start">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 ring-4 ring-amber-100/80 dark:bg-amber-900/60 dark:ring-amber-900/40">
                <Lock className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden />
              </div>
              <DialogTitle className="text-start text-xl">{t("encounters.confirmFinalizeTitle", "Finalize this encounter?")}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p id="encounter-finalize-desc" className="text-sm leading-relaxed text-muted-foreground">
              {t(
                "encounters.confirmFinalizeBody",
                "Once finalized, SOAP notes, vitals, medications, and documents can no longer be edited. This action cannot be undone."
              )}
            </p>
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
              <span className="text-muted-foreground">{t("encounters.status", "Status")}: </span>
              <span className="font-medium text-amber-900 dark:text-amber-100">
                {enc ? encounterStatusLabel(t, enc.status) : "—"}
              </span>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {encounterStatusLabel(t, "FINALIZED")}
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setFinalizeDialogOpen(false)} disabled={finalizeMutation.isPending}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
                disabled={finalizeMutation.isPending}
                onClick={() => finalizeMutation.mutate()}
              >
                {finalizeMutation.isPending ? t("common.loading", "Loading…") : t("encounters.confirmFinalizeAction", "Yes, finalize")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={noMedsConfirmOpen} onOpenChange={setNoMedsConfirmOpen}>
        <DialogContent
          className="gap-0 overflow-hidden border-slate-300 p-0 sm:max-w-md dark:border-slate-700"
          aria-describedby="encounter-no-meds-desc"
        >
          <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-5 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
            <DialogHeader className="space-y-3 text-start">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 ring-4 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-800/80">
                <Ban className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden />
              </div>
              <DialogTitle className="text-start text-xl">{t("encounters.confirmNoMedsTitle", "Mark no medications prescribed?")}</DialogTitle>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p id="encounter-no-meds-desc" className="text-sm leading-relaxed text-muted-foreground">
              {t(
                "encounters.confirmNoMedsBody",
                "Any medications you added and any uploaded prescriptions will be permanently removed from this encounter."
              )}
            </p>
            {hasMedicationData ? (
              <ul className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm dark:bg-destructive/10">
                {meds.length > 0 ? (
                  <li className="text-destructive/90 dark:text-destructive">
                    {t("encounters.confirmNoMedsMedsCount", "{{count}} manual medication(s) will be removed.", { count: meds.length })}
                  </li>
                ) : null}
                {prescriptions.length > 0 ? (
                  <li className="text-destructive/90 dark:text-destructive">
                    {t("encounters.confirmNoMedsRxCount", "{{count}} uploaded prescription(s) will be removed.", { count: prescriptions.length })}
                  </li>
                ) : null}
              </ul>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setNoMedsConfirmOpen(false)} disabled={noMedMutation.isPending}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={noMedMutation.isPending}
                onClick={() => noMedMutation.mutate(true)}
              >
                {noMedMutation.isPending ? t("common.loading", "Loading…") : t("encounters.confirmNoMedsAction", "Yes, remove all")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <input ref={replaceFileRef} type="file" accept="application/pdf,image/*,text/plain" className="hidden" onChange={onReplaceFilePicked} />

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("encounters.title")}</h1>
            <Badge variant={enc.status === "FINALIZED" ? "default" : "secondary"}>{formatEncounterStatus(enc.status, t)}</Badge>
          </div>
          <p className="text-muted-foreground">
            {formatVisitType(visitType, t)}
            <span
              className="ms-2 text-xs text-muted-foreground/90 ltr-nums"
              title={enc.patientId}
            >
              · {t("encounters.patient")}:{" "}
              {(() => {
                const r = resolvePatientListLabel({
                  patientId: enc.patientId,
                  patientMrn: enc.patientMrn,
                  patientName: enc.patientName,
                });
                return r.isIdFallback ? (
                  <span className="font-mono">{r.text}</span>
                ) : (
                  <span className="font-medium text-foreground">{r.text}</span>
                );
              })()}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleteMut.isPending}
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {t("encounters.delete", "Delete")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(true)}>
            <FileText className="me-2 h-4 w-4" />
            {t("invoices.generateShort", "Invoice")}
          </Button>
          <Button asChild variant="outline">
            <Link to="/encounters">{t("encounters.backList")}</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("encounters.visitFee", "Visit fee ({{currency}})", { currency: visitFeeCurrency })}
          </CardTitle>
          <CardDescription>
            {draft
              ? t("encounters.visitFeeEditableHint", "Adjust the visit fee while this encounter is open.")
              : t("encounters.visitFeeLockedHint", "Set when this encounter was created.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft ? (
            <>
              <Input
                className="max-w-xs ltr-nums text-lg font-semibold"
                inputMode="decimal"
                value={visitFeeAmount}
                onChange={(e) => setVisitFeeAmount(e.target.value)}
                placeholder="0.00"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {t("encounters.saveVisitFee", "Save visit fee")}
              </Button>
            </>
          ) : (
            <p className="text-lg font-semibold ltr-nums">
              {formatMoneyAmount(enc.visitFeeAmount ?? 0, visitFeeCurrency, localeForLanguage(i18n.language))}
            </p>
          )}
        </CardContent>
      </Card>

      {enc ? (
        <LinkedInvoicesSection encounterId={enc.id} clinicId={enc.clinicId} />
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            {t("encounters.vitals")}
          </CardTitle>
          <CardDescription>{draft ? t("encounters.editable") : t("encounters.readOnly")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex min-w-[7rem] items-center gap-2">
            <Heart className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("encounters.hr")}</Label>
              <Input
                className="h-9 ltr-nums"
                inputMode="numeric"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                disabled={!draft}
                placeholder="bpm"
              />
            </div>
          </div>
          <div className="flex min-w-[7rem] items-center gap-2">
            <Wind className="h-4 w-4 shrink-0 text-sky-500" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("encounters.spo2")}</Label>
              <Input
                className="h-9 ltr-nums"
                inputMode="numeric"
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                disabled={!draft}
                placeholder="%"
              />
            </div>
          </div>
          <div className="flex min-w-[10rem] items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            <div className="flex gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("encounters.bpSys")}</Label>
                <Input className="h-9 w-20 ltr-nums" value={bpSys} onChange={(e) => setBpSys(e.target.value)} disabled={!draft} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("encounters.bpDia")}</Label>
                <Input className="h-9 w-20 ltr-nums" value={bpDia} onChange={(e) => setBpDia(e.target.value)} disabled={!draft} />
              </div>
            </div>
          </div>
          <div className="flex min-w-[7rem] items-center gap-2">
            <Thermometer className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("encounters.tempC")}</Label>
              <Input className="h-9 ltr-nums" value={temperature} onChange={(e) => setTemperature(e.target.value)} disabled={!draft} />
            </div>
          </div>
          <div className="flex min-w-[7rem] items-center gap-2">
            <Scale className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("encounters.weightKg")}</Label>
              <Input className="h-9 ltr-nums" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} disabled={!draft} />
            </div>
          </div>
          <div className="flex min-w-[7rem] items-center gap-2">
            <Ruler className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("encounters.heightCm")}</Label>
              <Input className="h-9 ltr-nums" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} disabled={!draft} />
            </div>
          </div>
          {draft ? (
            <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {t("encounters.saveVitals")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 shrink-0" aria-hidden />
              {t("encounters.soap")}
            </CardTitle>
            <CardDescription>{draft ? t("encounters.editable") : t("encounters.readOnly")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vt">{t("encounters.visitType")}</Label>
              {draft ? (
                <select
                  id="vt"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value)}
                >
                  <option value="">{t("encounters.selectVisitType")}</option>
                  {ENCOUNTER_VISIT_TYPES.map((vt) => (
                    <option key={vt} value={vt}>
                      {formatVisitType(vt, t)}
                    </option>
                  ))}
                  {visitType && !(ENCOUNTER_VISIT_TYPES as readonly string[]).includes(visitType) ? (
                    <option value={visitType}>{formatVisitType(visitType, t)}</option>
                  ) : null}
                </select>
              ) : (
                <p className="text-sm">{formatVisitType(visitType, t)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc">{t("encounters.chiefComplaint")}</Label>
              <Input id="cc" value={chief} onChange={(e) => setChief(e.target.value)} disabled={!draft} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s" className="flex items-center gap-2">
                <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />S — {t("encounters.subjective")}
              </Label>
              <Textarea id="s" rows={3} value={subjective} onChange={(e) => setSubjective(e.target.value)} disabled={!draft} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="o">O — {t("encounters.objective")}</Label>
              <Textarea id="o" rows={3} value={objective} onChange={(e) => setObjective(e.target.value)} disabled={!draft} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a">A — {t("encounters.assessment")}</Label>
              <Textarea id="a" rows={3} value={assessment} onChange={(e) => setAssessment(e.target.value)} disabled={!draft} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">P — {t("encounters.planField")}</Label>
              <Textarea id="p" rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} disabled={!draft} />
            </div>
            {draft ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {t("common.save")}
                </Button>
                <Button type="button" onClick={() => setFinalizeDialogOpen(true)} disabled={finalizeMutation.isPending || !canFinalize}>
                  {t("encounters.finalize")}
                </Button>
              </div>
            ) : null}
            {!canFinalize && draft ? (
              <p className="text-xs text-muted-foreground">{t("encounters.finalizeHint")}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                {t("encounters.labs")}
              </CardTitle>
              <CardDescription>{t("encounters.labsHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden />
                  <input
                    type="file"
                    accept="application/pdf,image/*,text/plain"
                    className="text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadMutation.mutate({ file: f, kind: "LAB" });
                    }}
                  />
                </label>
              ) : null}
              <ul className="space-y-2 text-sm">
                {labs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                    <span className="truncate font-medium">{d.originalFileName}</span>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void openDocument(d)}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">{t("encounters.viewDoc")}</span>
                      </Button>
                      {draft ? (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => startReplace(d.id, "LAB")}>
                            <Upload className="h-4 w-4" />
                            <span className="sr-only">{t("encounters.replaceDoc", "Replace")}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeDocMutation.mutate(d.id)}
                            disabled={removeDocMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
                {labs.length === 0 ? <li className="text-muted-foreground">{t("encounters.noDocs")}</li> : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScanLine className="h-4 w-4 shrink-0 text-sky-600" aria-hidden />
                {t("encounters.radiology")}
              </CardTitle>
              <CardDescription>{t("encounters.radiologyHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Upload className="h-4 w-4 shrink-0" aria-hidden />
                  <input
                    type="file"
                    accept="application/pdf,image/*,text/plain"
                    className="text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadMutation.mutate({ file: f, kind: "RADIOLOGY" });
                    }}
                  />
                </label>
              ) : null}
              <ul className="space-y-2 text-sm">
                {radiology.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                    <span className="truncate font-medium">{d.originalFileName}</span>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void openDocument(d)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {draft ? (
                        <>
                          <Button type="button" variant="ghost" size="sm" onClick={() => startReplace(d.id, "RADIOLOGY")}>
                            <Upload className="h-4 w-4" />
                            <span className="sr-only">{t("encounters.replaceDoc", "Replace")}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeDocMutation.mutate(d.id)}
                            disabled={removeDocMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
                {radiology.length === 0 ? <li className="text-muted-foreground">{t("encounters.noDocs")}</li> : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Pill className="h-4 w-4 shrink-0" aria-hidden />
                {t("encounters.medications")}
              </CardTitle>
              <CardDescription>{t("encounters.medsHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeMedTab} onValueChange={(v) => selectMedTab(v as MedTab)}>
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
                    {meds.length > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                        {meds.length}
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
                    {prescriptions.length > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
                        {prescriptions.length}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="none" className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "encounters.noMedsTabHint",
                      "No medications were prescribed for this visit. Switch to Manual or Prescription tabs to add entries."
                    )}
                  </p>
                  {draft && noMedications ? (
                    <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("encounters.noMedsActive", "Selected")}</p>
                  ) : null}
                </TabsContent>

                <TabsContent value="manual" className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  {!medsPanelActive && draft ? (
                    <p className="mb-3 text-sm text-muted-foreground">{t("encounters.panelDisabledNoMeds")}</p>
                  ) : null}
                  <ul className="space-y-2 text-sm">
                    {meds.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
                        <div className="min-w-0">
                          <span className="font-medium">{m.drugName}</span>
                          {m.dosage ? <span className="text-muted-foreground"> · {m.dosage}</span> : null}
                          {m.frequency ? <span className="text-muted-foreground"> · {m.frequency}</span> : null}
                        </div>
                        {draft && medsPanelActive ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeMedMutation.mutate(m.id)}
                            disabled={removeMedMutation.isPending}
                          >
                            {t("common.remove")}
                          </Button>
                        ) : null}
                      </li>
                    ))}
                    {meds.length === 0 ? <li className="text-muted-foreground">{t("encounters.noMedsYet")}</li> : null}
                  </ul>
                  {meds.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {draft && medsPanelActive ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="gap-2"
                            disabled={generatePrescriptionMutation.isPending}
                            onClick={() => generatePrescriptionMutation.mutate()}
                          >
                            <FileText className="h-4 w-4 shrink-0" aria-hidden />
                            {t("encounters.generatePrescription")}
                          </Button>
                          <p className="text-xs text-muted-foreground">{t("encounters.generatePrescriptionHint")}</p>
                        </div>
                      ) : null}
                      {generatedRxPreview ? (
                        <div className="rounded-xl border border-emerald-300/80 bg-background p-3 dark:border-emerald-800">
                          <p className="mb-2 text-sm font-medium">{t("encounters.generatedPrescription")}</p>
                          <img
                            src={generatedRxPreview}
                            alt={t("encounters.generatedPrescription")}
                            className="mx-auto max-h-[min(70vh,520px)] w-full rounded-md border border-border object-contain"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" asChild>
                              <a href={generatedRxPreview} download={`prescription-${enc.patientMrn ?? enc.id}.png`}>
                                {t("encounters.downloadFile")}
                              </a>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => {
                                const ok = printPrescriptionImage(
                                  generatedRxPreview,
                                  t("encounters.generatedPrescription")
                                );
                                if (!ok) toast.error(t("encounters.printBlocked", "Allow pop-ups to print the prescription."));
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
                  {draft && medsPanelActive ? (
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
                        <Button type="button" className="w-full" onClick={() => addMedMutation.mutate()} disabled={!drugName.trim() || addMedMutation.isPending}>
                          {t("encounters.addMed")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="prescription" className="rounded-xl border border-violet-200/80 bg-violet-50/30 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                  {!medsPanelActive && draft ? (
                    <p className="mb-3 text-sm text-muted-foreground">{t("encounters.panelDisabledNoMeds")}</p>
                  ) : null}
                  {draft && medsPanelActive ? (
                    <>
                      <input
                        ref={prescriptionFileRef}
                        type="file"
                        accept="application/pdf,image/*,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) uploadMutation.mutate({ file: f, kind: "PRESCRIPTION" });
                        }}
                      />
                      <button
                        type="button"
                        disabled={uploadMutation.isPending}
                        onClick={() => prescriptionFileRef.current?.click()}
                        className={cn(
                          "mb-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm transition-colors",
                          "border-violet-300 bg-violet-50/50 text-violet-900 hover:border-violet-400 hover:bg-violet-50",
                          "dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-100 dark:hover:border-violet-500 dark:hover:bg-violet-950/50",
                          uploadMutation.isPending && "pointer-events-none opacity-60"
                        )}
                      >
                        <FileUp className="h-8 w-8 text-violet-500 dark:text-violet-400" aria-hidden />
                        <span className="font-medium">{t("encounters.uploadPrescription", "Upload prescription")}</span>
                        <span className="text-xs text-violet-700/80 dark:text-violet-300/80">{t("encounters.prescriptionUploadHint")}</span>
                      </button>
                    </>
                  ) : null}
                  <ul className="space-y-2 text-sm">
                    {prescriptions.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
                        <span className="truncate font-medium">{d.originalFileName}</span>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" variant="ghost" size="sm" onClick={() => void openDocument(d)}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">{t("encounters.viewDoc")}</span>
                          </Button>
                          {draft && medsPanelActive ? (
                            <>
                              <Button type="button" variant="ghost" size="sm" onClick={() => startReplace(d.id, "PRESCRIPTION")}>
                                <Upload className="h-4 w-4" />
                                <span className="sr-only">{t("encounters.replaceDoc", "Replace")}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => removeDocMutation.mutate(d.id)}
                                disabled={removeDocMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                    {prescriptions.length === 0 ? (
                      <li className="text-muted-foreground">{t("encounters.noPrescriptionYet")}</li>
                    ) : null}
                  </ul>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {viewer ? (
        <DocumentViewerOverlay
          fileName={viewer.doc.originalFileName}
          url={viewer.url}
          contentType={viewer.contentType}
          onClose={closeViewer}
        />
      ) : null}

      {enc ? (
        <GenerateInvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={setInvoiceDialogOpen}
          clinicId={enc.clinicId}
          encounterId={enc.id}
          patientName={
            resolvePatientListLabel({
              patientId: enc.patientId,
              patientMrn: enc.patientMrn,
              patientName: enc.patientName,
            }).text
          }
          defaultPurpose={formatVisitType(visitType, t)}
          defaultAmount={enc.visitFeeAmount ?? undefined}
        />
      ) : null}
    </div>
  );
}
