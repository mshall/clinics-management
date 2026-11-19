import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CLINICAL_SPECIALTY_VALUES, formatClinicalSpecialty } from "@/lib/clinical-specialties";
import {
  marketingPlanRows,
  monthlyAmountFromPrice,
  patientsToMakeKiorlyFree,
  type PublicPlan,
} from "./kiorly-free-calculator";

type PlansResponse = { market: { code: string; currency: string }; plans: PublicPlan[] };
type FeesResponse = {
  market: string;
  currency?: string;
  rates?: Array<{
    specialty: string | null;
    amount: string | null;
    feeType: string;
    effectiveFeeExample?: number | null;
  }>;
};
type CohortResponse = { key: string; remaining: number; cap?: number };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function MarketingHomePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const [patients, setPatients] = useState("40");
  const [planKey, setPlanKey] = useState("PRO");

  const plansQ = useQuery({
    queryKey: ["public", "plans", "EG"],
    queryFn: () => getJson<PlansResponse>("/api/v1/public/plans?market=EG"),
  });
  const feesQ = useQuery({
    queryKey: ["public", "kiorex-fees", "EG"],
    queryFn: () => getJson<FeesResponse>("/api/v1/public/kiorex-fees?market=EG"),
  });
  const cohortQ = useQuery({
    queryKey: ["public", "cohort", "FOUNDING_EG"],
    queryFn: () => getJson<CohortResponse>("/api/v1/public/cohorts/FOUNDING_EG/remaining"),
  });

  const rows = useMemo(
    () => (plansQ.data ? marketingPlanRows(plansQ.data.plans, lang) : []),
    [plansQ.data, lang],
  );

  const feePerPatient = useMemo(() => {
    const rates = feesQ.data?.rates ?? [];
    const flat = rates.find((r) => r.specialty == null);
    if (flat?.effectiveFeeExample != null) return Number(flat.effectiveFeeExample);
    if (flat?.amount) return Number(flat.amount);
    const any = rates.find((r) => r.effectiveFeeExample != null || r.amount);
    if (any?.effectiveFeeExample != null) return Number(any.effectiveFeeExample);
    return any?.amount ? Number(any.amount) : 40;
  }, [feesQ.data]);

  const selectedPlan = plansQ.data?.plans.find((p) => p.key === planKey) ?? plansQ.data?.plans[0];
  const monthlyPrice = selectedPlan?.prices.find((p) => p.interval === "MONTHLY") ?? selectedPlan?.prices[0];
  const monthly = monthlyPrice ? monthlyAmountFromPrice(monthlyPrice) : 0;
  const breakEven = patientsToMakeKiorlyFree(monthly, feePerPatient);
  const patientCount = Number(patients) || 0;
  const offset = patientCount * feePerPatient;
  const net = Math.max(0, monthly - offset);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-emerald-50 text-slate-900" data-testid="marketing-home">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <div className="text-2xl font-semibold tracking-tight text-teal-800">Kiorly</div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button asChild size="sm" variant="outline">
            <Link to="/login">{t("marketing.login", "Sign in")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/signup">{t("marketing.signup", "Start free")}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-16 px-4 pb-20 pt-8">
        <section className="space-y-4">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-teal-950 sm:text-5xl">
            {t("marketing.heroTitle", "Clinic software that pays for itself with Kiorex")}
          </h1>
          <p className="max-w-xl text-lg text-slate-600">
            {t(
              "marketing.heroBody",
              "Run your practice in Arabic and English. Book, chart, and collect — then fill empty slots from Kiorex.",
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">{t("marketing.ctaSignup", "Create clinic")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#pricing">{t("marketing.ctaPricing", "See pricing")}</a>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <a href="mailto:hello@kiorly.com?subject=Demo">{t("marketing.ctaDemo", "Book a demo")}</a>
            </Button>
          </div>
          {cohortQ.data ? (
            <p className="text-sm text-teal-800 ltr-nums" data-testid="founding-remaining">
              {t("marketing.foundingLeft", "{{count}} founding seats left", { count: cohortQ.data.remaining })}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">{t("marketing.specialtiesTitle", "Built for your specialty")}</h2>
          <p className="text-slate-600">{t("marketing.specialtiesBody", "Templates and flows for Egypt’s most common clinic types.")}</p>
          <ul className="flex flex-wrap gap-2">
            {CLINICAL_SPECIALTY_VALUES.slice(0, 12).map((s) => (
              <li key={s} className="rounded-full border border-teal-100 bg-white/80 px-3 py-1 text-sm">
                {formatClinicalSpecialty(s, t)}
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" className="space-y-4 scroll-mt-8">
          <h2 className="text-2xl font-semibold">{t("marketing.pricingTitle", "Pricing")}</h2>
          <p className="text-slate-600">
            {t("marketing.pricingBody", "Live prices from the Kiorly catalog for your market — never hardcoded.")}
          </p>
          {plansQ.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {rows.map((plan) => (
                <Card key={plan.key} data-testid={`marketing-plan-${plan.key}`}>
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {plan.prices.map((pr) => (
                      <div key={`${pr.interval}-${pr.unit}-${pr.amount}`} className="ltr-nums" data-testid={`plan-price-${plan.key}-${pr.interval}`}>
                        {pr.label}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section id="calculator" className="space-y-4">
          <h2 className="text-2xl font-semibold">{t("marketing.calcTitle", "How many Kiorex patients make Kiorly free?")}</h2>
          <p className="text-slate-600">
            {t(
              "marketing.calcBody",
              "Commission from attended Kiorex patients can offset your monthly plan. Fee comes from the public Kiorex rate card.",
            )}
          </p>
          <div className="grid gap-4 rounded-xl border border-teal-100 bg-white/90 p-4 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("marketing.calcPlan", "Plan")}</label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedPlan?.key ?? planKey}
                onChange={(e) => setPlanKey(e.target.value)}
              >
                {(plansQ.data?.plans ?? []).map((p) => (
                  <option key={p.key} value={p.key}>
                    {lang === "ar" ? p.nameAr : p.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("marketing.calcPatients", "Kiorex patients / month")}</label>
              <Input className="mt-1" value={patients} onChange={(e) => setPatients(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1 text-sm">
              <p className="ltr-nums">
                {t("marketing.calcFee", "Fee / patient")}: {feePerPatient} {plansQ.data?.market.currency ?? "EGP"}
              </p>
              <p className="ltr-nums" data-testid="calc-breakeven">
                {t("marketing.calcBreakeven", "Break-even")}: {breakEven ?? "—"}
              </p>
              <p className="ltr-nums font-medium" data-testid="calc-net">
                {t("marketing.calcNet", "Net SaaS after offset")}: {net.toFixed(2)}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
