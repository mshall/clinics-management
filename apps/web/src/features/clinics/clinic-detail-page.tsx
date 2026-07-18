import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Power, PowerOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicDeactivateConfirmDialog } from "@/features/clinics/clinic-deactivate-confirm-dialog";
import { ClinicDoctorsPanel } from "@/features/clinics/clinic-doctors-panel";
import { ClinicReactivateDialog } from "@/features/clinics/clinic-reactivate-dialog";
import { useClinicQuery } from "@/lib/api-hooks";
import { ApiError, apiPost } from "@/lib/http";
import { formatClinicName, formatClinicNameFields } from "@/lib/locale-display";
import { clinicKindLabel } from "@/lib/clinic-kind";
import { useAuthStore } from "@/stores/auth-store";

const MANAGE_CLINIC_ROLES = new Set(["group_admin", "clinic_admin", "branch_manager"]);

export function ClinicDetailPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const canManageClinic = authUser?.role ? MANAGE_CLINIC_ROLES.has(authUser.role) : false;
  const { id } = useParams();
  const { data: c, isPending, isError, error } = useClinicQuery(id);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  const deactivateMut = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/clinics/${id}/deactivate`, {
        effectiveDate: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      setDeactivateOpen(false);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["clinic", id] });
      toast.success(t("clinics.deactivateSuccess", "Clinic disabled."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const reactivateMut = useMutation({
    mutationFn: (startDate: string) =>
      apiPost(`/api/v1/clinics/${id}/reactivate`, { startDate }),
    onSuccess: () => {
      setReactivateOpen(false);
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["clinic", id] });
      toast.success(t("clinics.reactivateSuccess", "Clinic reactivated."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (isError || !c) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button asChild variant="outline">
          <Link to="/clinics">{t("nav.clinics")}</Link>
        </Button>
      </div>
    );
  }

  const name = formatClinicName(c, i18n.language);
  const formatPeriodDate = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString();

  return (
    <div className="space-y-4 sm:space-y-6">
      <ClinicDeactivateConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        clinic={{ nameEn: c.nameEn, nameAr: c.nameAr, city: c.city, country: c.country }}
        pending={deactivateMut.isPending}
        onConfirm={() => deactivateMut.mutate()}
      />
      <ClinicReactivateDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        clinic={{ nameEn: c.nameEn, nameAr: c.nameAr, disabledAt: c.disabledAt }}
        pending={reactivateMut.isPending}
        onConfirm={(startDate) => reactivateMut.mutate(startDate)}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name}</h1>
            <Badge variant={c.kind === "branch" ? "outline" : c.kind === "parent" ? "default" : "secondary"}>
              {clinicKindLabel(c.kind, t)}
            </Badge>
            {c.recordStatus === "INACTIVE" ? (
              <Badge variant="outline">{t("clinics.disabledBadge", "Disabled")}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            {c.city}, {c.country}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageClinic ? (
            c.recordStatus === "ACTIVE" ? (
              <Button
                type="button"
                variant="outline"
                disabled={deactivateMut.isPending}
                onClick={() => setDeactivateOpen(true)}
              >
                <PowerOff className="me-2 h-4 w-4" />
                {t("clinics.deactivate", "Disable")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                disabled={reactivateMut.isPending}
                onClick={() => setReactivateOpen(true)}
              >
                <Power className="me-2 h-4 w-4" />
                {t("clinics.reactivate", "Reactivate")}
              </Button>
            )
          ) : null}
          <Button asChild variant="outline">
            <Link to="/clinics">{t("common.back", "Back to list")}</Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="overview">{t("clinics.tabOverview", "Overview")}</TabsTrigger>
          <TabsTrigger value="history">{t("clinics.tabOperatingHistory", "Operating history")}</TabsTrigger>
          <TabsTrigger value="doctors">{t("clinics.tabDoctors", "Doctors assigned")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.detailRegistration", "Registration")}</CardTitle>
                <CardDescription>{t("clinics.detailRegistrationHint", "Values entered when the clinic was added.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("clinics.licenseNumber", "License")}: </span>
                  <span className="font-medium">{c.licenseNumber}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.phone", "Phone")}: </span>
                  <span className="ltr-nums font-medium">{c.phone}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.email", "Email")}: </span>
                  <span className="font-medium">{c.email}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.defaultLanguage", "Default language")}: </span>
                  <span className="font-medium">{c.defaultLanguage}</span>
                </p>
                {c.logoUrl ? (
                  <p>
                    <span className="text-muted-foreground">Logo URL: </span>
                    <span className="break-all text-xs">{c.logoUrl}</span>
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.detailLocation", "Location & addresses")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.addressEn", "Address (EN)")}</p>
                  <p>{c.addressEn}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.addressAr", "Address (AR)")}</p>
                  <p dir="rtl">{c.addressAr}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.locationUrl", "Map link")}</p>
                  <a href={c.locationUrl} className="break-all text-primary underline" target="_blank" rel="noreferrer">
                    {c.locationUrl}
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          {c.parentClinicId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.parentClinic", "Parent clinic")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{formatClinicNameFields(c.parentNameEn, c.parentNameAr, i18n.language)}</p>
                <Button asChild variant="link" className="h-auto px-0">
                  <Link to={`/clinics/${c.parentClinicId}`}>{t("clinics.viewParent", "View parent")}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("clinics.operatingTimeline", "Operating timeline")}</CardTitle>
              <CardDescription>
                {t(
                  "clinics.operatingTimelineHint",
                  "Periods when this clinic or branch was active. Gaps between periods indicate it was disabled.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {c.operatingPeriods.length ? (
                <ul className="space-y-3">
                  {c.operatingPeriods.map((period, index) => (
                    <li key={period.id} className="rounded-lg border px-3 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {t("clinics.operatingPeriodLabel", "Period {{n}}", { n: index + 1 })}
                        </span>
                        {!period.endDate ? (
                          <Badge variant="secondary">{t("clinics.operatingCurrent", "Current")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("clinics.operatingEnded", "Ended")}</Badge>
                        )}
                      </div>
                      <p className="mt-2 ltr-nums text-muted-foreground">
                        {formatPeriodDate(period.startDate)}
                        {" → "}
                        {period.endDate ? formatPeriodDate(period.endDate) : t("clinics.operatingPresent", "Present")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("clinics.operatingTimelineEmpty", "No operating history recorded.")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="doctors">
          <ClinicDoctorsPanel clinicId={c.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
