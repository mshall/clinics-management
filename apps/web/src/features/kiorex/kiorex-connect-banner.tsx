import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/http";
import "./kiorex-connect-i18n";
import type { ConnectDto } from "./kiorex-connect-types";

/** One-line status at the top of the Kiorex tab linking to the Connect to Kiorex checklist. Renders nothing for already-connected (legacy) organisations. */
export function KiorexConnectBanner({ clinicId }: { clinicId: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["kiorex", "connect", clinicId], queryFn: () => apiGet<ConnectDto>(`/api/v1/kiorex/connect?clinicId=${encodeURIComponent(clinicId)}`), enabled: Boolean(clinicId), retry: false });
  const d = q.data;
  if (!d || d.legacy) return null;
  const live = d.status === "APPROVED";
  const msg = live ? "live" : d.status === "REQUESTED" ? "requested" : d.status === "CHANGES_REQUESTED" ? "changes" : d.status === "REJECTED" ? "rejected" : d.status === "PAUSED" ? "paused" : "standalone";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="connect-banner" data-status={d.status}>
      <p className="text-sm">{t(`kiorexConnect.banner.${msg}`)} <span className="text-muted-foreground">({d.progress}%)</span></p>
      <Button asChild size="sm" variant={live ? "outline" : "default"}><Link to="/kiorex/connect">{t("kiorexConnect.banner.open")}</Link></Button>
    </div>
  );
}
