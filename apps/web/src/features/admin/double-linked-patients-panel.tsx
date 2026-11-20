import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";

type LinkedPatient = {
  id: string;
  mrn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  phone: string;
  email: string | null;
  nationalId: string | null;
  dob: string | null;
  gender: string;
  homeBranchId: string | null;
  createdAt: string;
};

type Cluster = {
  reason: "phone" | "nationalId" | "name_dob";
  matchKey: string;
  patients: LinkedPatient[];
};

type DoubleLinkedResponse = {
  clusters: Cluster[];
  totalClusters: number;
  scannedPatients: number;
};

const MERGE_FIELDS = [
  "firstNameEn",
  "lastNameEn",
  "firstNameAr",
  "lastNameAr",
  "phone",
  "email",
  "nationalId",
  "dob",
  "gender",
  "homeBranchId",
  "acquisitionChannel",
  "isVip",
  "needsChaperone",
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

function displayName(p: LinkedPatient, lang: string): string {
  if (lang.startsWith("ar") && (p.firstNameAr || p.lastNameAr)) {
    return `${p.firstNameAr ?? ""} ${p.lastNameAr ?? ""}`.trim() || `${p.firstNameEn} ${p.lastNameEn}`;
  }
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

function fieldValue(p: LinkedPatient, field: MergeField): string {
  const v = (p as Record<string, unknown>)[field];
  if (v == null || v === "") return "—";
  if (field === "dob" && typeof v === "string") {
    try {
      return new Date(v).toLocaleDateString();
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function DoubleLinkedPatientsPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = localeForLanguage(i18n.language);
  const [mergePair, setMergePair] = useState<{ target: LinkedPatient; source: LinkedPatient } | null>(null);
  const [choices, setChoices] = useState<Partial<Record<MergeField, "target" | "source">>>({});
  const [confirm, setConfirm] = useState(false);

  const q = useQuery({
    queryKey: ["admin", "data-explorer", "double-linked-patients"],
    queryFn: () => apiGet<DoubleLinkedResponse>("/api/v1/admin/data-explorer/double-linked-patients"),
  });

  const differingFields = useMemo(() => {
    if (!mergePair) return [] as MergeField[];
    return MERGE_FIELDS.filter((f) => {
      const a = fieldValue(mergePair.target, f);
      const b = fieldValue(mergePair.source, f);
      return a !== b;
    });
  }, [mergePair]);

  const merge = useMutation({
    mutationFn: () => {
      if (!mergePair) throw new Error("No pair");
      return apiPost(`/api/v1/patients/${mergePair.target.id}/merge`, {
        sourcePatientId: mergePair.source.id,
        fieldChoices: choices,
      });
    },
    onSuccess: () => {
      toast.success(t("patients.mergeDone", "Duplicate merged into this chart."));
      setMergePair(null);
      setChoices({});
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ["admin", "data-explorer", "double-linked-patients"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reasonLabel = (reason: Cluster["reason"]) => {
    if (reason === "phone") return t("admin.doubleLinkedReasonPhone", "Same phone");
    if (reason === "nationalId") return t("admin.doubleLinkedReasonNationalId", "Same national ID");
    return t("admin.doubleLinkedReasonNameDob", "Same name and date of birth");
  };

  const openMerge = (keep: LinkedPatient, retire: LinkedPatient) => {
    setMergePair({ target: keep, source: retire });
    setChoices({});
    setConfirm(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("admin.doubleLinkedTitle", "Double-linked patients")}
          </CardTitle>
          <CardDescription>
            {t(
              "admin.doubleLinkedDescription",
              "Charts that look like the same person (matching phone, national ID, or name with date of birth). Merge them into one account and choose which fields to keep.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {q.isPending ? (
            <p className="text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : q.isError ? (
            <p className="text-destructive">{q.error instanceof Error ? q.error.message : String(q.error)}</p>
          ) : (q.data?.clusters.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">
              {t("admin.doubleLinkedEmpty", "No likely duplicate patient charts found.")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("admin.doubleLinkedSummary", "{{clusters}} group(s) · scanned {{scanned}} patients", {
                  clusters: q.data?.totalClusters ?? 0,
                  scanned: q.data?.scannedPatients ?? 0,
                })}
              </p>
              <ul className="space-y-4">
                {q.data?.clusters.map((cluster) => (
                  <li
                    key={`${cluster.reason}-${cluster.matchKey}`}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                    data-testid="double-linked-cluster"
                  >
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {reasonLabel(cluster.reason)}
                    </p>
                    <ul className="space-y-2">
                      {cluster.patients.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/70 bg-background px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{displayName(p, i18n.language)}</p>
                            <p className="text-xs text-muted-foreground ltr-nums">
                              {p.mrn} · {p.phone}
                              {p.nationalId ? ` · ${p.nationalId}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("admin.doubleLinkedCreated", "Created {{date}}", {
                                date: new Date(p.createdAt).toLocaleString(locale),
                              })}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {cluster.patients
                              .filter((other) => other.id !== p.id)
                              .map((other) => (
                                <Button
                                  key={other.id}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openMerge(p, other)}
                                >
                                  {t("admin.doubleLinkedKeepMerge", "Keep this · merge {{mrn}}", {
                                    mrn: other.mrn,
                                  })}
                                </Button>
                              ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={mergePair != null}
        onOpenChange={(open) => {
          if (!open && !merge.isPending) {
            setMergePair(null);
            setConfirm(false);
          }
        }}
      >
        <DialogContent className="max-h-[min(90vh,40rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.doubleLinkedMergeTitle", "Merge patient charts")}</DialogTitle>
          </DialogHeader>
          {mergePair ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {t(
                  "admin.doubleLinkedMergeHint",
                  "Keep {{keep}} ({{keepMrn}}) and retire {{retire}} ({{retireMrn}}). For each differing field, choose which value to keep.",
                  {
                    keep: displayName(mergePair.target, i18n.language),
                    keepMrn: mergePair.target.mrn,
                    retire: displayName(mergePair.source, i18n.language),
                    retireMrn: mergePair.source.mrn,
                  },
                )}
              </p>
              {differingFields.length === 0 ? (
                <p className="text-muted-foreground">
                  {t("admin.doubleLinkedNoDiffs", "No differing profile fields — related records will still move over.")}
                </p>
              ) : (
                <ul className="space-y-3">
                  {differingFields.map((field) => (
                    <li key={field} className="rounded-md border border-border p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t(`admin.mergeField.${field}`, field)}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 px-2 py-2">
                          <input
                            type="radio"
                            className="mt-1"
                            name={`merge-${field}`}
                            checked={(choices[field] ?? "target") === "target"}
                            onChange={() => setChoices((c) => ({ ...c, [field]: "target" }))}
                          />
                          <span>
                            <span className="block text-xs text-muted-foreground">
                              {t("admin.doubleLinkedKeepAccount", "Keep account")}
                            </span>
                            <span className="break-all">{fieldValue(mergePair.target, field)}</span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-muted/20 px-2 py-2">
                          <input
                            type="radio"
                            className="mt-1"
                            name={`merge-${field}`}
                            checked={choices[field] === "source"}
                            onChange={() => setChoices((c) => ({ ...c, [field]: "source" }))}
                          />
                          <span>
                            <span className="block text-xs text-muted-foreground">
                              {t("admin.doubleLinkedOtherAccount", "Other account")}
                            </span>
                            <span className="break-all">{fieldValue(mergePair.source, field)}</span>
                          </span>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <Label className="font-normal">
                  {t("patients.mergeConfirm", "I understand this cannot be undone easily")}
                </Label>
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={merge.isPending} onClick={() => setMergePair(null)}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!confirm || merge.isPending}
                  onClick={() => merge.mutate()}
                >
                  {t("patients.mergeRun", "Merge into this patient")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
