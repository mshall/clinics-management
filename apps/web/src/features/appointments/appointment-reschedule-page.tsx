import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatetimeLocalField } from "@/components/datetime-local-field";
import { Label } from "@/components/ui/label";
import { PatientPrivacyNoticeLink } from "@/components/patient-privacy-notice-link";
import { apiUrl } from "@/lib/api-url";
import { formatClinicName, localeForLanguage } from "@/lib/locale-display";

type RescheduleSummary = {
  appointmentId: string;
  clinicNameEn: string;
  clinicNameAr: string | null;
  patientName: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  status: string;
};

async function fetchSummary(token: string): Promise<RescheduleSummary> {
  const res = await fetch(apiUrl(`/api/v1/public/appointments/reschedule/${encodeURIComponent(token)}`));
  const body = (await res.json().catch(() => ({}))) as RescheduleSummary & { message?: string };
  if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
  return body;
}

async function postReschedule(token: string, startsAt: string) {
  const res = await fetch(apiUrl(`/api/v1/public/appointments/reschedule/${encodeURIComponent(token)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startsAt }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; ok?: boolean };
  if (!res.ok) throw new Error(body.message ?? `Failed (${res.status})`);
  return body;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AppointmentReschedulePage() {
  const { token } = useParams();
  const { t, i18n } = useTranslation();
  const lang = localeForLanguage(i18n.language);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["public-reschedule", token],
    enabled: Boolean(token),
    queryFn: () => fetchSummary(token!),
  });
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      if (!token || !startsAtLocal) throw new Error(t("reschedule.missingTime", "Pick a new date and time"));
      const iso = new Date(startsAtLocal).toISOString();
      return postReschedule(token, iso);
    },
    onSuccess: () => setDone(true),
  });

  if (!token) {
    return <p className="p-6 text-sm text-muted-foreground">{t("reschedule.invalidLink", "Invalid reschedule link.")}</p>;
  }

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>;
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : t("reschedule.loadError", "Could not load appointment.")}
      </p>
    );
  }

  const clinicLabel = data
    ? formatClinicName({ nameEn: data.clinicNameEn, nameAr: data.clinicNameAr }, lang)
    : "";

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("reschedule.title", "Reschedule your visit")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("reschedule.clinicPatient", "{{clinic}} · {{patient}}", {
              clinic: clinicLabel,
              patient: data?.patientName ?? "",
            })}
          </p>
          {done ? (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              {t("reschedule.success", "Your new appointment time is saved. See you then!")}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="reschedule-starts">{t("reschedule.newTime", "New date & time")}</Label>
                <DatetimeLocalField
                  id="reschedule-starts"
                  value={startsAtLocal || (data?.startsAt ? toDatetimeLocalValue(data.startsAt) : "")}
                  onChange={setStartsAtLocal}
                />
              </div>
              <Button type="button" className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t("common.loading", "Loading…") : t("reschedule.submit", "Confirm new time")}
              </Button>
              {save.isError ? (
                <p className="text-sm text-destructive">
                  {save.error instanceof Error ? save.error.message : t("reschedule.saveError", "Could not save.")}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t("reschedule.privacyFooter")} <PatientPrivacyNoticeLink className="text-xs" />
      </p>
    </div>
  );
}