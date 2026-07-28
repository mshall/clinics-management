import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  collectClinicHoursErrors,
  formatClinicHoursRange,
  resolveClinicClosingTime,
  resolveClinicOpeningTime,
} from "@/lib/clinic-hours";
import { localeForLanguage } from "@/lib/locale-display";
import { ApiError, apiPatch } from "@/lib/http";

type ClinicHoursSettingsPanelProps = {
  clinicId: string;
  openingTime: string;
  closingTime: string;
  canEdit: boolean;
};

export function ClinicHoursSettingsPanel({
  clinicId,
  openingTime,
  closingTime,
  canEdit,
}: ClinicHoursSettingsPanelProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = localeForLanguage(i18n.language);
  const resolvedOpen = resolveClinicOpeningTime(openingTime);
  const resolvedClose = resolveClinicClosingTime(closingTime);
  const [open, setOpen] = useState(resolvedOpen);
  const [close, setClose] = useState(resolvedClose);

  useEffect(() => {
    setOpen(resolveClinicOpeningTime(openingTime));
    setClose(resolveClinicClosingTime(closingTime));
  }, [openingTime, closingTime]);

  const saveMut = useMutation({
    mutationFn: () => apiPatch(`/api/v1/clinics/${clinicId}`, { openingTime: open, closingTime: close }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(t("clinics.hoursSaved", "Clinic hours updated."));
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

  const hourIssues = collectClinicHoursErrors(open, close, t);
  const unchanged = open === resolvedOpen && close === resolvedClose;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.hoursSettings", "Working hours")}</CardTitle>
        <CardDescription>
          {t(
            "clinics.hoursSettingsHint",
            "Daily opening and closing times used for appointment booking guidance. Call center staff see a warning when booking after closing.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clinic-opening-time">{t("admin.clinicOpeningTime", "Opening time")}</Label>
                <Input
                  id="clinic-opening-time"
                  type="time"
                  className="ltr-nums"
                  value={open}
                  step={900}
                  onChange={(e) => setOpen(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic-closing-time">{t("admin.clinicClosingTime", "Closing time")}</Label>
                <Input
                  id="clinic-closing-time"
                  type="time"
                  className="ltr-nums"
                  value={close}
                  step={900}
                  onChange={(e) => setClose(e.target.value)}
                />
              </div>
            </div>
            {hourIssues.length > 0 ? (
              <p className="text-sm text-destructive">{hourIssues.join(" ")}</p>
            ) : null}
            <Button
              type="button"
              disabled={saveMut.isPending || unchanged || hourIssues.length > 0}
              onClick={() => saveMut.mutate()}
            >
              {t("common.save", "Save")}
            </Button>
          </>
        ) : (
          <p className="text-sm font-medium ltr-nums">
            {formatClinicHoursRange(resolvedOpen, resolvedClose, locale)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
