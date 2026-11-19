import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error-message";
import { apiGet, apiPatch, apiPut } from "@/lib/http";

type Prefs = {
  optOutAll: boolean;
  doctorTomorrowList: boolean;
  ownerWeeklyInsights: boolean;
  ownerShiftSummaries: boolean;
  kiorexProgressNudges: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

type Notice = {
  id: string;
  kind: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  readAt: string | null;
  createdAt: string;
};

/** MS-04 — WhatsApp digests, quiet hours, CR-07 Kiorly-free notices. */
export function DigestPreferencesCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const prefsQ = useQuery({
    queryKey: ["digest-preferences"],
    queryFn: () => apiGet<Prefs>("/api/v1/digests/preferences"),
  });
  const noticesQ = useQuery({
    queryKey: ["digest-notices"],
    queryFn: () => apiGet<Notice[]>("/api/v1/digests/notices?unreadOnly=true"),
  });
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    if (prefsQ.data) setPrefs(prefsQ.data);
  }, [prefsQ.data]);

  const save = useMutation({
    mutationFn: (body: Prefs) => apiPut<Prefs>("/api/v1/digests/preferences", body),
    onSuccess: (data) => {
      setPrefs(data);
      toast.success(t("digests.saved", "Digest preferences saved"));
      void qc.invalidateQueries({ queryKey: ["digest-preferences"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/digests/notices/${id}/read`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["digest-notices"] }),
  });

  if (!prefs) {
    return <p className="text-sm text-muted-foreground">{t("digests.loading", "Loading digest preferences…")}</p>;
  }

  const toggle = (key: keyof Prefs) => setPrefs((p) => (p ? { ...p, [key]: !p[key] } : p));
  const ar = i18n.language.startsWith("ar");

  return (
    <div className="space-y-4" data-testid="digest-preferences">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("digests.title", "WhatsApp digests")}
          </CardTitle>
          <CardDescription>
            {t("digests.subtitle", "Tomorrow's list for doctors, owner weekly insights, shift summaries, and Kiorly-free progress. Quiet hours pause delivery.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.optOutAll} onChange={() => toggle("optOutAll")} data-testid="digest-opt-out" />
            {t("digests.optOutAll", "Opt out of all digests and progress nudges")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.doctorTomorrowList} disabled={prefs.optOutAll} onChange={() => toggle("doctorTomorrowList")} />
            {t("digests.doctorTomorrow", "Doctor: tomorrow's appointments at 20:00")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.ownerWeeklyInsights} disabled={prefs.optOutAll} onChange={() => toggle("ownerWeeklyInsights")} />
            {t("digests.ownerWeekly", "Owner: weekly insights (Pro+)")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.ownerShiftSummaries} disabled={prefs.optOutAll} onChange={() => toggle("ownerShiftSummaries")} />
            {t("digests.ownerShift", "Owner: cash summary after shift close")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.kiorexProgressNudges} disabled={prefs.optOutAll} onChange={() => toggle("kiorexProgressNudges")} />
            {t("digests.kiorexNudges", "Owner: Kiorly-free progress nudges & monthly recap")}
          </label>
          <div className="grid max-w-sm grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("digests.quietStart", "Quiet from (hour)")}</Label>
              <Input
                type="number"
                min={0}
                max={23}
                className="ltr-nums"
                value={prefs.quietHoursStart}
                onChange={(e) => setPrefs({ ...prefs, quietHoursStart: Number(e.target.value) })}
                data-testid="quiet-start"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("digests.quietEnd", "Quiet until (hour)")}</Label>
              <Input
                type="number"
                min={0}
                max={23}
                className="ltr-nums"
                value={prefs.quietHoursEnd}
                onChange={(e) => setPrefs({ ...prefs, quietHoursEnd: Number(e.target.value) })}
                data-testid="quiet-end"
              />
            </div>
          </div>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate(prefs)} data-testid="save-digests">
            {t("digests.save", "Save preferences")}
          </Button>
        </CardContent>
      </Card>

      {(noticesQ.data ?? []).length > 0 ? (
        <Card data-testid="digest-notices">
          <CardHeader>
            <CardTitle>{t("digests.notices", "Unread notices")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(noticesQ.data ?? []).map((n) => (
              <div key={n.id} className="rounded-md border p-3">
                <p className="font-medium">{ar && n.titleAr ? n.titleAr : n.titleEn}</p>
                <p className="text-muted-foreground">{ar && n.bodyAr ? n.bodyAr : n.bodyEn}</p>
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => markRead.mutate(n.id)}>
                  {t("digests.markRead", "Mark read")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
