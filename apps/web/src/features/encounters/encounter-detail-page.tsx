import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Eye,
  FileText,
  FlaskConical,
  Heart,
  Pill,
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
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolvePatientListLabel } from "@/lib/patient-display";
import { ENCOUNTER_VISIT_TYPES } from "@/lib/visit-types";
import { useAuthStore } from "@/stores/auth-store";
import { useEncounterQuery } from "@/lib/api-hooks";
import type { EncounterDetailDto, EncounterDocumentDto } from "@/lib/api-types";
import { ApiError, apiDelete, apiFetchBlob, apiPatch, apiPost, apiPostFormData } from "@/lib/http";

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

export function EncounterDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { data: enc, isPending, isError, error } = useEncounterQuery(id);

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
  const [noMedications, setNoMedications] = useState(false);
  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ doc: EncounterDocumentDto; url: string; contentType: string } | null>(null);
  const viewerUrlRef = useRef<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const pendingReplaceRef = useRef<{ docId: string; kind: "LAB" | "RADIOLOGY" } | null>(null);

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
    setNoMedications(enc.noMedications ?? false);
  }, [enc?.id]);

  useEffect(() => {
    return () => {
      if (viewerUrlRef.current) {
        URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = null;
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

  const noMedMutation = useMutation({
    mutationFn: (v: boolean) => apiPatch<EncounterDetailDto>(`/api/v1/encounters/${id}`, { noMedications: v }),
    onSuccess: (data) => {
      setNoMedications(data.noMedications);
      setErr(null);
      invalidate();
    },
    onError: (e: unknown) => {
      setErr(e instanceof Error ? e.message : String(e));
    },
  });

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
      });
    },
    onSuccess: () => {
      setErr(null);
      setMsg(t("encounters.saved"));
      invalidate();
    },
    onError: (e: unknown) => {
      setMsg(null);
      setErr(e instanceof Error ? e.message : String(e));
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
      setErr(null);
      setMsg(t("encounters.medAdded"));
      invalidate();
    },
    onError: (e: unknown) => {
      setMsg(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setErr(String((e.body as { message?: string }).message));
      } else setErr(e instanceof Error ? e.message : String(e));
    },
  });

  const removeMedMutation = useMutation({
    mutationFn: (mid: string) => apiDelete(`/api/v1/encounters/${id}/medications/${mid}`),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const uploadMutation = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: "LAB" | "RADIOLOGY" }) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      return apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${id}/documents`, fd);
    },
    onSuccess: () => {
      setErr(null);
      setMsg(t("encounters.docUploaded"));
      invalidate();
    },
    onError: (e: unknown) => {
      setMsg(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setErr(String((e.body as { message?: string }).message));
      } else setErr(e instanceof Error ? e.message : String(e));
    },
  });

  const removeDocMutation = useMutation({
    mutationFn: (docId: string) => apiDelete(`/api/v1/encounters/${id}/documents/${docId}`),
    onSuccess: () => invalidate(),
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
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
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const startReplace = (docId: string, kind: "LAB" | "RADIOLOGY") => {
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
      setErr(null);
      setMsg(null);
      await apiDelete(`/api/v1/encounters/${id}/documents/${pending.docId}`);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", pending.kind);
      await apiPostFormData<EncounterDocumentDto>(`/api/v1/encounters/${id}/documents`, fd);
      setMsg(t("encounters.docReplaced", "Document replaced"));
      invalidate();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setErr(String((e.body as { message?: string }).message));
      } else setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const finalizeMutation = useMutation({
    mutationFn: () => apiPost<EncounterDetailDto>(`/api/v1/encounters/${id}/finalize`, {}),
    onSuccess: (data) => {
      setErr(null);
      setMsg(t("encounters.finalized"));
      invalidate();
      if (data.appointmentId) {
        void qc.invalidateQueries({ queryKey: ["appointment", data.appointmentId] });
      }
    },
    onError: (e: unknown) => {
      setMsg(null);
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setErr(String((e.body as { message?: string }).message));
      } else setErr(e instanceof Error ? e.message : String(e));
    },
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
  const meds = enc.medications ?? [];

  return (
    <div className="space-y-6">
      <input ref={replaceFileRef} type="file" accept="application/pdf,image/*,text/plain" className="hidden" onChange={onReplaceFilePicked} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{t("encounters.title")}</h1>
            <Badge variant={enc.status === "FINALIZED" ? "default" : "secondary"}>{enc.status}</Badge>
          </div>
          <p className="text-muted-foreground">
            {visitType}
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
          <Button asChild variant="outline">
            <Link to="/encounters">{t("encounters.backList")}</Link>
          </Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</p> : null}
      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("encounters.visitFee", "Visit fee")}</CardTitle>
          <CardDescription>{t("encounters.visitFeeLockedHint", "Set when this encounter was created.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold ltr-nums">
            {new Intl.NumberFormat(i18n.language === "ar" ? "ar-AE" : "en-AE", { style: "currency", currency: "AED" }).format(
              enc.visitFeeAmount ?? 0
            )}
          </p>
        </CardContent>
      </Card>

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
                  <option value="">{i18n.language === "ar" ? "اختر نوع الزيارة" : "Select visit type"}</option>
                  {ENCOUNTER_VISIT_TYPES.map((vt) => (
                    <option key={vt} value={vt}>
                      {vt}
                    </option>
                  ))}
                  {visitType && !(ENCOUNTER_VISIT_TYPES as readonly string[]).includes(visitType) ? (
                    <option value={visitType}>{visitType}</option>
                  ) : null}
                </select>
              ) : (
                <p className="text-sm">{visitType}</p>
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
                <Button type="button" onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending || !canFinalize}>
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
            <CardContent className="space-y-4">
              {draft ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={noMedications}
                    disabled={noMedMutation.isPending}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setNoMedications(v);
                      noMedMutation.mutate(v);
                    }}
                  />
                  <span>{t("encounters.noMedsCheck")}</span>
                </label>
              ) : null}
              <ul className="space-y-2 text-sm">
                {meds.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                    <div>
                      <span className="font-medium">{m.drugName}</span>
                      {m.dosage ? <span className="text-muted-foreground"> · {m.dosage}</span> : null}
                      {m.frequency ? <span className="text-muted-foreground"> · {m.frequency}</span> : null}
                    </div>
                    {draft ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeMedMutation.mutate(m.id)}
                        disabled={removeMedMutation.isPending || noMedications}
                      >
                        {t("common.remove")}
                      </Button>
                    ) : null}
                  </li>
                ))}
                {meds.length === 0 && !noMedications ? (
                  <li className="text-muted-foreground">{t("encounters.noMedsYet")}</li>
                ) : null}
              </ul>
              {draft && !noMedications ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t("encounters.drugName")}</Label>
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
                    <Button type="button" onClick={() => addMedMutation.mutate()} disabled={!drugName.trim() || addMedMutation.isPending}>
                      {t("encounters.addMed")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {viewer ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={closeViewer}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="truncate text-sm font-medium">{viewer.doc.originalFileName}</p>
              <Button type="button" variant="secondary" size="sm" onClick={closeViewer}>
                {t("common.close")}
              </Button>
            </div>
            <div className="max-h-[calc(90vh-3rem)] overflow-auto p-4">
              {viewer.contentType.startsWith("image/") ? (
                <img src={viewer.url} alt="" className="mx-auto max-h-[70vh] max-w-full object-contain" />
              ) : viewer.contentType.includes("pdf") ? (
                <iframe title={viewer.doc.originalFileName} src={viewer.url} className="h-[70vh] w-full rounded border" />
              ) : (
                <a href={viewer.url} download={viewer.doc.originalFileName} className="text-primary underline">
                  {t("encounters.downloadFile")}
                </a>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
