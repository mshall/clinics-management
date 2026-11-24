import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClinicsQuery } from "@/lib/api-hooks";
import { apiGet } from "@/lib/http";
import { showNavItem } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import "./kiorex-door-i18n";
import { useHomeCardDismissed } from "./dismissed-cards";
import type { FrontDoorDto } from "./kiorex-door-types";

/** One dismissible card on the home dashboard for standalone owners/admins. Quiet: no pop-up; dismissal is remembered per user and the card returns only when asked from the Kiorex tab. */
export function KiorexHomeCard() {
  const { t } = useTranslation(); const user = useAuthStore((s) => s.user);
  const allowed = !!user && (showNavItem(user.role, "clinics", user.navTabKeys, user.roleNavTabKeys, user.employeePrivilegeGrants, user.roles, user.entitlements, user.plan?.key ?? null) || showNavItem(user.role, "admin", user.navTabKeys, user.roleNavTabKeys, user.employeePrivilegeGrants, user.roles, user.entitlements, user.plan?.key ?? null));
  const { dismissed: hidden, setDismissed } = useHomeCardDismissed(user?.id);
  const clinics = useClinicsQuery(); const clinicId = clinics.data?.[0]?.id ?? "";
  const q = useQuery({ queryKey: ["kiorex", "front-door", clinicId], queryFn: () => apiGet<FrontDoorDto>(`/api/v1/kiorex/front-door?clinicId=${encodeURIComponent(clinicId)}`), enabled: allowed && !hidden && Boolean(clinicId), retry: false });
  if (!allowed || hidden || !user || !q.data || !["NOT_CONNECTED", "IN_PROGRESS"].includes(q.data.state)) return null;
  return (
    <section className="relative rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 pe-12 sm:p-5 sm:pe-14" aria-labelledby="kx-home-h" data-testid="kiorex-home-card">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1"><h2 id="kx-home-h" className="font-semibold">{t("kiorexMarketing.homeCard.title")}</h2><p className="text-sm text-muted-foreground">{t("kiorexMarketing.homeCard.body")}</p></div>
        <Button asChild size="sm"><Link to="/kiorex" data-testid="home-card-open">{t("kiorexMarketing.homeCard.open")}</Link></Button>
      </div>
      <button type="button" className="absolute end-2 top-2 inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" aria-label={t("kiorexMarketing.homeCard.dismiss")} data-testid="home-card-dismiss" onClick={() => setDismissed(true)}><X className="size-4" aria-hidden="true" /></button>
    </section>
  );
}
