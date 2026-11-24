import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinicsQuery } from "@/lib/api-hooks";
import { useSyncOnChange } from "@/lib/use-sync-on-change";
import { useGrowthAccess, useProfilePreview } from "./growth-api";
import { PerformanceSection, ProfilePreviewCard, Recommendations, StatementSection } from "./growth-insights";
import { CommissionStatements } from "./commission-statements";
import { LinksSection } from "./links-table";
import { ShareableSlots } from "./shareable-slots";
import { SocialTemplates } from "./social-templates";
import { VerificationRequests } from "./verification-requests";
import "./provider-marketing-i18n";
import { WidgetSettings } from "./widget-settings";

const TABS = ["links", "share", "slots", "widget", "performance", "statement", "verification"] as const;
type Tab = (typeof TABS)[number];

/** Kiorly "Growth & Marketing" workspace (GRW-P1-D1): public profile preview, links and QR codes, widget configurator, acquisition performance, recommendations and the fee statement. Works without a Kiorex connection. */
export function GrowthPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const [params, setParams] = useSearchParams();
  const access = useGrowthAccess();
  const clinics = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  useSyncOnChange([clinicId, clinics.data?.[0]?.id], () => {
    if (!clinicId && clinics.data?.length) setClinicId(clinics.data[0]!.id);
  });
  const profile = useProfilePreview(clinicId);
  const requested = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "links";
  const a = access.data;
  const branches = (clinics.data ?? []).map((c) => ({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr }));

  return (
    <div className="space-y-6" data-testid="growth-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("growth.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("growth.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {clinics.data && clinics.data.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="growth-clinic">{t("growth.clinic")}</Label>
              <select id="growth-clinic" className="native-select h-10" value={clinicId} onChange={(e) => setClinicId(e.target.value)} data-testid="growth-clinic">
                {clinics.data.map((c) => <option key={c.id} value={c.id}>{isAr ? c.nameAr || c.nameEn : c.nameEn}</option>)}
              </select>
            </div>
          ) : null}
          <Button asChild variant="outline" size="sm"><Link to="/kiorex" data-testid="growth-kiorex-link"><Sparkles className="size-4" aria-hidden />{t("growth.kiorexTab")}</Link></Button>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--kx-product-clinic)]/40 bg-[color:var(--kx-product-clinic)]/5 p-4" data-testid="growth-promise">
        <p className="text-sm font-semibold">{t("growth.promise")}</p>
        <p className="text-sm text-muted-foreground">{t("growth.promiseDetail")}</p>
      </div>

      {access.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
      {access.isError ? (
        <EmptyState tone="error" title={t("growth.loadError")} action={<Button variant="outline" size="sm" onClick={() => void access.refetch()}>{t("growth.retry")}</Button>} />
      ) : null}
      {a && !a.can.view ? <EmptyState title={t("growth.forbidden")} description={t(`growth.roles.${a.level}`)} /> : null}

      {a?.can.view && clinicId ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Recommendations clinicId={clinicId} />
            <ProfilePreviewCard clinicId={clinicId} />
          </div>
          <Tabs value={tab} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", v); return n; }, { replace: true })}>
            <TabsList aria-label={t("growth.title")}>
              {TABS.map((k) => <TabsTrigger key={k} value={k} data-testid={`growth-tab-${k}`}>{t(k === "share" || k === "slots" || k === "verification" ? `growth.pm.tabs.${k}` : `growth.tabs.${k}`)}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="links" className="mt-4"><LinksSection clinicId={clinicId} branches={branches} profile={profile.data} access={a} /></TabsContent>
            <TabsContent value="share" className="mt-4"><SocialTemplates clinicId={clinicId} access={a} profile={profile.data} /></TabsContent>
            <TabsContent value="slots" className="mt-4"><ShareableSlots clinicId={clinicId} access={a} profile={profile.data} /></TabsContent>
            <TabsContent value="widget" className="mt-4"><WidgetSettings clinicId={clinicId} access={a} profile={profile.data} /></TabsContent>
            <TabsContent value="performance" className="mt-4"><PerformanceSection clinicId={clinicId} access={a} /></TabsContent>
            <TabsContent value="statement" className="mt-4 space-y-4"><StatementSection clinicId={clinicId} /><CommissionStatements clinicId={clinicId} access={a} /></TabsContent>
            <TabsContent value="verification" className="mt-4"><VerificationRequests clinicId={clinicId} access={a} /></TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
