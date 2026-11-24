import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet } from "@/lib/http";
import { useKiorexConnect } from "./kiorex-connect-hooks";
import { useFrontDoor } from "./kiorex-door-hooks";
import { useHomeCardDismissed } from "./dismissed-cards";
import { KiorexLanding } from "./kiorex-landing";
import { KiorexLiveDashboard } from "./kiorex-live-dashboard";
import { KiorexProgressPanel } from "./kiorex-progress-panel";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { KiorexBookingLinkCard } from "./kiorex-booking-link-card";
import { KiorexBookingSettingsCard } from "./kiorex-booking-settings-card";
import { KiorexPayoutsCard } from "./kiorex-payouts-card";
import { KiorexPerformanceCard } from "./kiorex-performance-card";
import { KiorexPolicyCard } from "./kiorex-policy-card";
import { KiorexRatingsCard } from "./kiorex-ratings-card";
import type { KiorexSettingsDto } from "./kiorex-types";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

export function KiorexPage() {
  const { t, i18n } = useTranslation();
  const clinics = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");

  useSyncOnChange([clinicId, clinics.data?.[0]?.id], () => {
    if (!clinicId && clinics.data?.length) setClinicId(clinics.data[0]!.id);
  });

  const door = useFrontDoor(clinicId);
  const connect = useKiorexConnect(clinicId);
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { dismissed: cardDismissed, setDismissed: setCardDismissed } = useHomeCardDismissed(userId || undefined);
  const state = door.data?.state;
  // the day-to-day cards (booking settings, policy, ...) are for connected organisations; before that the front door is the whole page
  const connected = state === "LIVE" || state === "ATTENTION";

  const settings = useQuery({
    queryKey: ["kiorex", "settings", clinicId],
    queryFn: () => apiGet<KiorexSettingsDto>(`/api/v1/kiorex/settings?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId) && connected,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("kiorexTab.title", "Kiorex")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("kiorexTab.subtitle", "Control how patients find and book you on Kiorex, and see what it brings in.")}
          </p>
        </div>
        {clinics.data && clinics.data.length > 1 ? (
          <div className="space-y-1">
            <Label htmlFor="kiorex-clinic">{t("kiorexTab.clinic", "Branch")}</Label>
            <select
              id="kiorex-clinic"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
            >
              {clinics.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {i18n.language.startsWith("ar") ? c.nameAr || c.nameEn : c.nameEn}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {door.isError ? <p className="text-sm text-destructive" data-testid="kiorex-load-error">{t("kiorexDoor.unavailable")}</p> : null}
      {clinicId && !door.data && door.isLoading ? <p className="text-sm text-muted-foreground" role="status">{t("kiorexDoor.loading")}</p> : null}
      {door.data ? (
        <p className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium" data-testid="kiorex-state" data-state={door.data.state}>{t(`kiorexDoor.state.${door.data.state}`)}</p>
      ) : null}
      {state === "NOT_CONNECTED" && door.data ? (
        <>
          <KiorexLanding clinicId={clinicId} door={door.data} connect={connect.data} />
          {userId && cardDismissed ? <Button variant="ghost" size="sm" data-testid="home-card-show" onClick={() => { setCardDismissed(false); toast.success(t("kiorexMarketing.homeCard.shown")); }}>{t("kiorexMarketing.homeCard.show")}</Button> : null}
        </>
      ) : null}
      {(state === "IN_PROGRESS" || state === "WAITING" || state === "ATTENTION") && connect.data && !connect.data.legacy ? <KiorexProgressPanel state={state} connect={connect.data} clinicId={clinicId} /> : null}
      {state === "LIVE" && door.data ? <KiorexLiveDashboard clinicId={clinicId} door={door.data} connect={connect.data} /> : null}
      {settings.isError ? (
        <p className="text-sm text-destructive">
          {t("kiorexTab.loadError", "Kiorex settings are available to clinic owners and managers.")}
        </p>
      ) : null}
      {connected && settings.data ? (
        <>
          <KiorexPerformanceCard clinicId={clinicId} />
          <KiorexPayoutsCard clinicId={clinicId} />
          <KiorexBookingSettingsCard clinicId={clinicId} settings={settings.data} />
          <KiorexBookingLinkCard clinicId={clinicId} />
          <KiorexRatingsCard clinicId={clinicId} />
          <KiorexPolicyCard clinicId={clinicId} settings={settings.data} />
        </>
      ) : null}
    </div>
  );
}
