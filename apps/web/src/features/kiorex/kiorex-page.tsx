import { useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/filter-select";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet } from "@/lib/http";
import { formatClinicName } from "@/lib/locale-display";
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

/** Sentinel for all branches in the organization (KX-10 org scope). */
const KIOREX_ORG_SCOPE = "__all__";

export function KiorexPage() {
  const { t, i18n } = useTranslation();
  const clinics = useClinicsQuery();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const scopeReady = clinicId !== null;
  const isOrgScope = scopeReady && clinicId === KIOREX_ORG_SCOPE;
  const activeClinicId = isOrgScope ? "" : (clinicId ?? "");

  useSyncOnChange([clinicId, clinics.data?.[0]?.id], () => {
    if (clinicId === null && clinics.data?.length) setClinicId(clinics.data[0]!.id);
  });

  const door = useFrontDoor(activeClinicId);
  const connect = useKiorexConnect(activeClinicId);
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const { dismissed: cardDismissed, setDismissed: setCardDismissed } = useHomeCardDismissed(userId || undefined);
  const state = door.data?.state;
  // the day-to-day cards (booking settings, policy, ...) are for connected organisations; before that the front door is the whole page
  const connected = !isOrgScope && (state === "LIVE" || state === "ATTENTION");

  const settings = useQuery({
    queryKey: ["kiorex", "settings", activeClinicId],
    queryFn: () => apiGet<KiorexSettingsDto>(`/api/v1/kiorex/settings?clinicId=${encodeURIComponent(activeClinicId)}`),
    enabled: Boolean(activeClinicId) && connected,
  });

  const branchOptions = [
    {
      value: KIOREX_ORG_SCOPE,
      label: t("kiorexTab.scopeOrganization", "All organization"),
      description: t("kiorexTab.scopeOrganizationHint", "Combined Kiorex performance across every branch"),
    },
    ...(clinics.data ?? []).map((c) => ({
      value: c.id,
      label: formatClinicName(c, i18n.language),
    })),
  ];

  const showBranchFilter = (clinics.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("kiorexTab.title", "Kiorex")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("kiorexTab.subtitle", "Control how patients find and book you on Kiorex, and see what it brings in.")}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to="/kiorex/growth" data-testid="kiorex-growth-link">
              <Megaphone className="size-4" aria-hidden />
              {t("nav.growth", "Growth & Marketing")}
            </Link>
          </Button>
        </div>
        {showBranchFilter ? (
          <div className="w-full max-w-xs space-y-1.5 sm:w-auto sm:min-w-[16rem]">
            <Label htmlFor="kiorex-clinic">{t("kiorexTab.clinic", "Branch")}</Label>
            <FilterSelect
              id="kiorex-clinic"
              label={t("kiorexTab.clinic", "Branch")}
              value={clinicId ?? KIOREX_ORG_SCOPE}
              onChange={setClinicId}
              options={branchOptions}
              data-testid="kiorex-clinic"
              triggerClassName="min-w-[16rem]"
            />
          </div>
        ) : null}
      </div>

      {isOrgScope ? (
        <KiorexPerformanceCard clinicId={KIOREX_ORG_SCOPE} orgScope />
      ) : (
        <>
          {door.isError ? (
            <p className="text-sm text-destructive" data-testid="kiorex-load-error">
              {t("kiorexDoor.unavailable")}
            </p>
          ) : null}
          {activeClinicId && !door.data && door.isLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("kiorexDoor.loading")}
            </p>
          ) : null}
          {door.data ? (
            <p
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
              data-testid="kiorex-state"
              data-state={door.data.state}
            >
              {t(`kiorexDoor.state.${door.data.state}`)}
            </p>
          ) : null}
          {state === "NOT_CONNECTED" && door.data ? (
            <>
              <KiorexLanding clinicId={activeClinicId} door={door.data} connect={connect.data} />
              {userId && cardDismissed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="home-card-show"
                  onClick={() => {
                    setCardDismissed(false);
                    toast.success(t("kiorexMarketing.homeCard.shown"));
                  }}
                >
                  {t("kiorexMarketing.homeCard.show")}
                </Button>
              ) : null}
            </>
          ) : null}
          {(state === "IN_PROGRESS" || state === "WAITING" || state === "ATTENTION") &&
          connect.data &&
          !connect.data.legacy ? (
            <KiorexProgressPanel state={state} connect={connect.data} clinicId={activeClinicId} />
          ) : null}
          {state === "LIVE" && door.data ? (
            <KiorexLiveDashboard clinicId={activeClinicId} door={door.data} connect={connect.data} />
          ) : null}
          {settings.isError ? (
            <p className="text-sm text-destructive">
              {t("kiorexTab.loadError", "Kiorex settings are available to clinic owners and managers.")}
            </p>
          ) : null}
          {connected && settings.data ? (
            <>
              <KiorexPerformanceCard clinicId={activeClinicId} />
              <KiorexPayoutsCard clinicId={activeClinicId} />
              <KiorexBookingSettingsCard clinicId={activeClinicId} settings={settings.data} />
              <KiorexBookingLinkCard clinicId={activeClinicId} />
              <KiorexRatingsCard clinicId={activeClinicId} />
              <KiorexPolicyCard clinicId={activeClinicId} settings={settings.data} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
