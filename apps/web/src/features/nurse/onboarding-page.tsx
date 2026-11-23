import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { AvailabilityEditor, ZonesEditor } from "./availability-zones";
import { ErrorBlock, LoadingBlock, PageShell, StatusPill } from "./nurse-shared";
import { useNurseContext } from "./nurse-shared-utils";

type Step = { key: "profession_verification" | "coverage_zones" | "services_offered" | "prices" | "availability" | "safety_contact"; done: boolean; extra?: string[] };
type Onboarding = { kind: "SOLO" | "AGENCY" | null; steps: Step[]; complete: boolean };

/** KNED03 — onboarding for a solo nurse (verification with ID/selfie and criminal-record evidence, zones, services, prices, availability, safety contact) or an agency (staff verification, services, prices, safety contact). */
export function NurseOnboardingPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const ctx = useNurseContext();
  const q = useQuery({ queryKey: ["nurse", "onboarding"], queryFn: () => apiGet<Onboarding>("/api/v1/nurse/onboarding") });
  const kind = q.data?.kind ?? ctx.data?.kind ?? null;
  const done = q.data?.steps.filter((s) => s.done).length ?? 0;
  const total = q.data?.steps.length ?? 0;
  const listingOn = ctx.data?.features["nurse.individual_kiorex_listing"];
  return (
    <PageShell title={t("nurse.onboarding.title")} subtitle={kind ? t(`nurse.onboarding.kind.${kind}`) : undefined} testId="nurse-onboarding">
      {q.isLoading ? <LoadingBlock /> : null}
      {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <p className="text-sm" role="status" data-testid="onboarding-progress">{q.data.complete ? t("nurse.onboarding.complete") : t("nurse.onboarding.progress", { done, total })}</p>
          <ol className="space-y-3">
            {q.data.steps.map((s) => (
              <li key={s.key}>
                <Card data-testid="onboarding-step" data-step={s.key} data-done={String(s.done)}>
                  <CardContent className="space-y-2 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium">{s.done ? <CheckCircle2 className="size-5 text-[hsl(var(--success))]" aria-hidden /> : <Circle className="size-5 text-muted-foreground" aria-hidden />}{t(`nurse.onboarding.steps.${s.key}.title`)}</p>
                      <StatusPill tone={s.done ? "ok" : "warn"}>{s.done ? t("nurse.onboarding.done") : t("nurse.onboarding.todo")}</StatusPill>
                    </div>
                    <p className="text-muted-foreground">{t(`nurse.onboarding.steps.${s.key}.help`)}</p>
                    {s.extra?.length ? <p className="text-muted-foreground">{t("nurse.onboarding.evidence")}: {s.extra.map((e) => t(`nurse.onboarding.evidenceItems.${e}`, e)).join(", ")}</p> : null}
                    {s.key === "profession_verification" && !s.done ? <Button asChild size="sm" className="min-h-11"><Link to="/profile/verification">{t("nurse.onboarding.openVerification")}</Link></Button> : null}
                    {(s.key === "services_offered" || s.key === "prices") && !s.done ? <Button asChild size="sm" className="min-h-11"><Link to="/nurse/services">{t("nurse.onboarding.openServices")}</Link></Button> : null}
                    {s.key === "safety_contact" && !s.done ? <Button asChild size="sm" className="min-h-11"><Link to="/nurse/safety">{t("nurse.onboarding.openSafety")}</Link></Button> : null}
                  </CardContent>
                </Card>
                {s.key === "coverage_zones" && !s.done && me ? <div className="mt-2"><ZonesEditor clinicianId={me.id} /></div> : null}
                {s.key === "availability" && !s.done && me ? <div className="mt-2"><AvailabilityEditor clinicianId={me.id} /></div> : null}
              </li>
            ))}
          </ol>
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">{t("nurse.onboarding.kiorexTitle")}</p>
              <p className="text-muted-foreground">{kind === "AGENCY" ? t("nurse.onboarding.kiorexAgency") : t("nurse.onboarding.kiorexSolo")}</p>
              {kind !== "AGENCY" && listingOn === false ? <p className="text-[hsl(var(--warning))] " data-testid="onboarding-listing-paused">{t("nurse.onboarding.listingPaused")}</p> : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}
