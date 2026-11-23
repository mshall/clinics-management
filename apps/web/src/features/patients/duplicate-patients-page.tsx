import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitMerge, Phone, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { canEditPatientDetails } from "@/lib/patient-edit-policy";
import { mapApiRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";

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
  safeToAutoMerge: boolean;
};

type DuplicatesResponse = {
  clusters: Cluster[];
  totalClusters: number;
  duplicatePatientCount: number;
  scannedPatients: number;
};

const PAGE_SIZE = 10;

function displayName(p: LinkedPatient, lang: string): string {
  if (lang.startsWith("ar") && (p.firstNameAr || p.lastNameAr)) {
    return `${p.firstNameAr ?? ""} ${p.lastNameAr ?? ""}`.trim() || `${p.firstNameEn} ${p.lastNameEn}`;
  }
  return `${p.firstNameEn} ${p.lastNameEn}`.trim();
}

export function DuplicatePatientsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = localeForLanguage(i18n.language);
  const role = useAuthStore((s) => s.user?.role);
  const navTabKeys = useAuthStore((s) => s.user?.navTabKeys);
  const navTabAccessModes = useAuthStore((s) => s.user?.navTabAccessModes);
  const canManage =
    canEditPatientDetails(role, navTabKeys, navTabAccessModes) &&
    ["group_admin", "clinic_admin", "branch_manager"].includes(mapApiRole(String(role ?? "")));

  const [search, setSearch] = useState("");
  const [safeOnly, setSafeOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [mergePair, setMergePair] = useState<{ target: LinkedPatient; source: LinkedPatient } | null>(null);

  const q = useQuery({
    queryKey: ["patients", "duplicates", "phone"],
    queryFn: () => apiGet<DuplicatesResponse>("/api/v1/patients/duplicates?reason=phone"),
    enabled: canManage,
  });

  const filtered = useMemo(() => {
    const clusters = q.data?.clusters ?? [];
    const qLower = search.trim().toLowerCase();
    return clusters.filter((c) => {
      if (safeOnly && !c.safeToAutoMerge) return false;
      if (!qLower) return true;
      if (c.matchKey.toLowerCase().includes(qLower)) return true;
      return c.patients.some((p) => {
        const name = displayName(p, i18n.language).toLowerCase();
        return (
          name.includes(qLower) ||
          p.mrn.toLowerCase().includes(qLower) ||
          p.phone.toLowerCase().includes(qLower)
        );
      });
    });
  }, [q.data?.clusters, search, safeOnly, i18n.language]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const mergeOne = useMutation({
    mutationFn: () => {
      if (!mergePair) throw new Error("No pair");
      return apiPost(`/api/v1/patients/${mergePair.target.id}/merge`, {
        sourcePatientId: mergePair.source.id,
        fieldChoices: {},
      });
    },
    onSuccess: () => {
      toast.success(t("patients.mergeDone", "Duplicate merged into this chart."));
      setMergePair(null);
      void qc.invalidateQueries({ queryKey: ["patients", "duplicates"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const mergeAllSafe = useMutation({
    mutationFn: () => apiPost<{ mergedClusters: number }>("/api/v1/patients/duplicates/merge-safe", {}),
    onSuccess: (res) => {
      toast.success(
        t("patients.duplicatesMergeAllDone", "Merged {{count}} duplicate group(s).", {
          count: res.mergedClusters ?? 0,
        }),
      );
      setConfirmBulk(false);
      void qc.invalidateQueries({ queryKey: ["patients", "duplicates"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  if (!canManage) {
    return <Navigate to="/patients" replace />;
  }

  const safeCount = (q.data?.clusters ?? []).filter((c) => c.safeToAutoMerge).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            to="/patients"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("patients.backToPatients", "Back to patients")}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{t("patients.duplicatesTitle", "Duplicate patients")}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {t(
              "patients.duplicatesSubtitle",
              "Charts that share the same mobile number. Merge them into one record so visits and documents stay together.",
            )}
          </p>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          disabled={safeCount === 0 || mergeAllSafe.isPending}
          onClick={() => setConfirmBulk(true)}
        >
          <GitMerge className="size-4" aria-hidden />
          {t("patients.duplicatesMergeAllSafe", "Merge all safe groups")}
          {safeCount > 0 ? (
            <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
              {safeCount}
            </span>
          ) : null}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border/80 bg-gradient-to-br from-background to-muted/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wide">
              <Users className="size-3.5" aria-hidden />
              {t("patients.duplicatesStatGroups", "Duplicate groups")}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{q.data?.totalClusters ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 bg-gradient-to-br from-background to-muted/40">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wide">
              <Phone className="size-3.5" aria-hidden />
              {t("patients.duplicatesStatCharts", "Charts involved")}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{q.data?.duplicatePatientCount ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 bg-gradient-to-br from-background to-muted/40">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase tracking-wide">
              {t("patients.duplicatesStatSafe", "Safe to auto-merge")}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-[hsl(var(--success))]">{safeCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{t("patients.duplicatesTableTitle", "Phone matches")}</CardTitle>
            <CardDescription>
              {t(
                "patients.duplicatesTableHint",
                "Review each group, keep one chart, and merge the rest. Groups marked safe share compatible names.",
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t("patients.duplicatesSearchPh", "Search name, MRN, or phone…")}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={safeOnly}
                onChange={(e) => {
                  setSafeOnly(e.target.checked);
                  setPage(1);
                }}
              />
              {t("patients.duplicatesSafeOnly", "Safe to merge only")}
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
          ) : q.isError ? (
            <p className="text-sm text-destructive">{apiErrorMessage(q.error)}</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {t("patients.duplicatesEmpty", "No phone-number duplicates found.")}
            </p>
          ) : (
            <>
              <ul className="space-y-4">
                {pageRows.map((cluster) => (
                  <li
                    key={`${cluster.reason}-${cluster.matchKey}`}
                    className="overflow-hidden rounded-xl border border-border bg-muted/15 shadow-sm"
                    data-testid="duplicate-phone-cluster"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-background/80 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          <Phone className="size-3" aria-hidden />
                          <span className="ltr-nums">{cluster.patients[0]?.phone ?? cluster.matchKey}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {t("patients.duplicatesChartsInGroup", "{{count}} charts", {
                            count: cluster.patients.length,
                          })}
                        </span>
                        {cluster.safeToAutoMerge ? (
                          <span className="rounded-full bg-[hsl(var(--success))]/15 px-2 py-0.5 text-xs font-medium text-[hsl(var(--success))]">
                            {t("patients.duplicatesSafeBadge", "Safe to merge")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[hsl(var(--warning))]/15 px-2 py-0.5 text-xs font-medium text-[hsl(var(--warning))]">
                            {t("patients.duplicatesReviewBadge", "Review names")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-border/60">
                      {cluster.patients.map((p) => (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <Link
                              to={`/patients/${p.id}`}
                              className="font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              {displayName(p, i18n.language)}
                            </Link>
                            <p className="text-xs text-muted-foreground ltr-nums">
                              {p.mrn} · {p.phone}
                              {p.nationalId ? ` · ${p.nationalId}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("patients.duplicatesCreated", "Created {{date}}", {
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
                                  onClick={() => setMergePair({ target: p, source: other })}
                                >
                                  {t("patients.duplicatesKeepMerge", "Keep · merge {{mrn}}", {
                                    mrn: other.mrn,
                                  })}
                                </Button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                <p className="text-muted-foreground tabular-nums">
                  {t("patients.duplicatesPageStatus", "Showing {{from}}–{{to}} of {{total}}", {
                    from: (pageSafe - 1) * PAGE_SIZE + 1,
                    to: Math.min(pageSafe * PAGE_SIZE, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t("common.previous", "Previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    {t("common.next", "Next")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={(open) => {
          if (!open && !mergeAllSafe.isPending) setConfirmBulk(false);
        }}
        title={t("patients.duplicatesMergeAllTitle", "Merge all safe duplicates?")}
        description={t(
          "patients.duplicatesMergeAllBody",
          "This merges {{count}} phone group(s) where names look like the same person. Documents and visits move to the richer chart. This cannot be undone.",
          { count: safeCount },
        )}
        confirmLabel={t("patients.duplicatesMergeAllAction", "Merge all safe")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={mergeAllSafe.isPending}
        onConfirm={() => mergeAllSafe.mutate()}
      />

      <ConfirmDialog
        open={mergePair != null}
        onOpenChange={(open) => {
          if (!open && !mergeOne.isPending) setMergePair(null);
        }}
        title={t("patients.duplicatesMergeOneTitle", "Merge these charts?")}
        description={
          mergePair
            ? t(
                "patients.duplicatesMergeOneBody",
                "Keep {{keep}} and merge {{retire}} into it. Visits and documents move over.",
                {
                  keep: `${displayName(mergePair.target, i18n.language)} (${mergePair.target.mrn})`,
                  retire: `${displayName(mergePair.source, i18n.language)} (${mergePair.source.mrn})`,
                },
              )
            : ""
        }
        confirmLabel={t("patients.duplicatesMergeOneAction", "Merge charts")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={mergeOne.isPending}
        onConfirm={() => mergeOne.mutate()}
      />
    </div>
  );
}
