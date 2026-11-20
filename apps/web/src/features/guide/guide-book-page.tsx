import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Languages,
  Lightbulb,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { enhancedGuideForRole } from "@/features/guide/guide-role-enhanced";
import type { GuideSection, GuideStep } from "@/features/guide/guide-types";
import { GuideWizardAnimation } from "@/features/guide/guide-wizard-animation";
import { NAV_ITEM_PATH, effectiveNavKeys } from "@/lib/nav-policy";
import { formatUserRole } from "@/lib/locale-display";
import { mapApiRole } from "@/lib/roles";
import type { NavItemKey } from "@/lib/nav-policy";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const SECTION_ACCENTS = [
  "from-kx-indigo-600/15 via-transparent to-transparent",
  "from-kx-ocean-600/15 via-transparent to-transparent",
  "from-emerald-500/15 via-transparent to-transparent",
  "from-amber-500/15 via-transparent to-transparent",
];

const NAV_LABEL: Record<string, { en: string; ar: string }> = {
  dashboard: { en: "Dashboard", ar: "لوحة المعلومات" },
  patients: { en: "Patients", ar: "المرضى" },
  encounters: { en: "Encounters", ar: "الزيارات" },
  appointments: { en: "Appointments", ar: "المواعيد" },
  operations: { en: "Operations", ar: "العمليات" },
  clinics: { en: "Clinics", ar: "العيادات" },
  expenses: { en: "Expenses", ar: "المصروفات" },
  revenue: { en: "Revenue", ar: "الإيرادات" },
  hr: { en: "HR", ar: "الموارد البشرية" },
  reports: { en: "Reports", ar: "التقارير" },
  customer_support: { en: "Support", ar: "الدعم" },
  admin: { en: "Admin", ar: "الإدارة" },
  doctor_revenue: { en: "Doctor revenue", ar: "إيراد الطبيب" },
  platform: { en: "Platform", ar: "المنصة" },
  profile: { en: "Profile", ar: "الملف الشخصي" },
};

function StepBilingual({ step, layout }: { step: GuideStep; layout: "split" | "stack" }) {
  const detailEn = step.detailEn ?? step.bodyEn;
  const detailAr = step.detailAr ?? step.bodyAr;
  return (
    <div
      className={cn(
        "grid gap-3 text-sm",
        layout === "split" ? "md:grid-cols-2" : "grid-cols-1",
      )}
    >
      <div className="space-y-1 rounded-md border border-border/50 bg-card/60 p-3" dir="ltr">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">English</p>
        <p className="font-medium text-foreground">{step.titleEn}</p>
        <p className="text-muted-foreground leading-relaxed">{step.bodyEn}</p>
        {detailEn !== step.bodyEn ? (
          <p className="text-xs leading-relaxed text-muted-foreground/90">{detailEn}</p>
        ) : null}
      </div>
      <div className="space-y-1 rounded-md border border-border/50 bg-card/60 p-3" dir="rtl">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-end">العربية</p>
        <p className="font-medium text-foreground text-end">{step.titleAr}</p>
        <p className="text-muted-foreground leading-relaxed text-end">{step.bodyAr}</p>
        {detailAr !== step.bodyAr ? (
          <p className="text-xs leading-relaxed text-muted-foreground/90 text-end">{detailAr}</p>
        ) : null}
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  index,
  showSplitBilingual,
}: {
  section: GuideSection;
  index: number;
  showSplitBilingual: boolean;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = section.steps[activeStep];

  useEffect(() => {
    if (!playing || section.steps.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveStep((s) => (s + 1) % section.steps.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [playing, section.steps.length]);
  const visual = step?.visual ?? (section.featured ? "navigate" : "navigate");

  const title = section.titleEn;
  const summary = section.summaryEn;

  return (
    <Card id={section.id} className="scroll-mt-20 overflow-hidden border-border/80 shadow-sm lg:col-span-2">
      <div className={cn("h-1 w-full bg-gradient-to-r", SECTION_ACCENTS[index % SECTION_ACCENTS.length] ?? SECTION_ACCENTS[0])} />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-3xl space-y-2">
            <MotionDirTitle title={title} titleAr={section.titleAr} />
            <CardDescription className="text-sm leading-relaxed">
              <span dir="ltr" className="block">{summary}</span>
              <span dir="rtl" className="mt-1 block text-muted-foreground">{section.summaryAr}</span>
            </CardDescription>
          </div>
          <MotionBadges index={index} featured={section.featured} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MotionWizardHeader
          playing={playing}
          onPlay={() => setPlaying((p) => !p)}
          stepCount={section.steps.length}
          activeStep={activeStep}
        />

        <GuideWizardAnimation
          kind={visual}
          activeStep={activeStep}
          playing={playing}
          labelEn={step?.titleEn}
          labelAr={step?.titleAr}
        />

        <ol className="space-y-4">
          {section.steps.map((s, si) => (
            <li
              key={`${section.id}-${si}`}
              className={cn(
                "rounded-xl border p-3 transition-all duration-300",
                si === activeStep
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-border/60 bg-muted/20 hover:bg-muted/35",
              )}
            >
              <button
                type="button"
                className="mb-3 flex w-full items-center gap-3 text-start"
                onClick={() => {
                  setActiveStep(si);
                  setPlaying(false);
                }}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ltr-nums",
                    si === activeStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {si + 1}
                </span>
                <span className="text-sm font-medium">
                  <span dir="ltr">{s.titleEn}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span dir="rtl">{s.titleAr}</span>
                </span>
              </button>

              <StepBilingual step={s} layout={showSplitBilingual ? "split" : "stack"} />

              {s.path ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="default" size="sm" asChild>
                    <Link to={s.path}>
                      <span dir="ltr">Open in app</span>
                      <span className="mx-1 text-primary-foreground/70">·</span>
                      <span dir="rtl">افتح في التطبيق</span>
                      <ChevronRight className="ms-1 size-4 rtl:rotate-180" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {section.tipsEn?.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <Lightbulb className="size-4" />
              <span dir="ltr">Pro tips</span>
              <span className="opacity-60">/</span>
              <span dir="rtl">نصائح</span>
            </p>
            <ul className="grid gap-2 md:grid-cols-2 text-sm text-muted-foreground">
              {section.tipsEn.map((tip, i) => (
                <li key={tip} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div>
                    <p dir="ltr">{tip}</p>
                    {section.tipsAr?.[i] ? <p dir="rtl" className="text-xs">{section.tipsAr[i]}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MotionDirTitle({ title, titleAr }: { title: string; titleAr: string }) {
  return (
    <CardTitle className="text-lg leading-snug">
      <span dir="ltr" className="block">{title}</span>
      <span dir="rtl" className="block text-base font-semibold text-muted-foreground">{titleAr}</span>
    </CardTitle>
  );
}

function MotionBadges({ index, featured }: { index: number; featured?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <Badge variant="secondary" className="shrink-0 font-mono text-xs">
        {String(index + 1).padStart(2, "0")}
      </Badge>
      {featured ? (
        <Badge variant="outline" className="text-[10px]">
          Feature walkthrough
        </Badge>
      ) : null}
    </div>
  );
}

function MotionWizardHeader({
  playing,
  onPlay,
  stepCount,
  activeStep,
}: {
  playing: boolean;
  onPlay: () => void;
  stepCount: number;
  activeStep: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        <span dir="ltr">Animated wizard</span>
        <span className="mx-1">·</span>
        <span dir="rtl">معالج تفاعلي</span>
        <span className="ms-2 font-mono text-foreground ltr-nums">
          {activeStep + 1}/{stepCount}
        </span>
      </p>
      <Button type="button" size="sm" variant={playing ? "secondary" : "outline"} onClick={onPlay}>
        {playing ? <Pause className="me-1 size-3.5" /> : <Play className="me-1 size-3.5" />}
        {playing ? "Pause" : "Play demo"}
      </Button>
    </div>
  );
}

export function GuideBookPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ? mapApiRole(user.role) : undefined;
  const guide = useMemo(
    () => enhancedGuideForRole(role, user?.navTabKeys, user?.roleNavTabKeys),
    [role, user?.navTabKeys, user?.roleNavTabKeys],
  );

  const [showSplitBilingual, setShowSplitBilingual] = useState(true);

  const headline = guide.headlineEn;
  const roleLabel = formatUserRole(user?.role ?? "", t);

  const navKeys = useMemo(() => {
    if (!role) return [];
    const keys = effectiveNavKeys(role, user?.navTabKeys, user?.roleNavTabKeys);
    return [...keys].filter((k) => k !== "profile") as NavItemKey[];
  }, [role, user?.navTabKeys, user?.roleNavTabKeys]);

  return (
    <div className="space-y-8 pb-10">
      <MotionHero
        headline={headline}
        headlineAr={guide.headlineAr}
        subtitleEn={guide.subtitleEn}
        subtitleAr={guide.subtitleAr}
        roleLabel={roleLabel}
        navKeys={navKeys}
        t={t}
      />

      <MotionToolbar showSplit={showSplitBilingual} onToggle={() => setShowSplitBilingual((v) => !v)} sectionCount={guide.sections.length} />

      <MotionSections sections={guide.sections} showSplitBilingual={showSplitBilingual} />

      <p className="text-center text-xs text-muted-foreground">
        {t(
          "guide.footer",
          "For technical RFC/PRD detail, see the documentation portal in the repository Docs folder.",
        )}
      </p>
    </div>
  );
}

function MotionHero(props: {
  headline: string;
  headlineAr: string;
  subtitleEn: string;
  subtitleAr: string;
  roleLabel: string;
  navKeys: NavItemKey[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { headline, headlineAr, subtitleEn, subtitleAr, roleLabel, navKeys, t } = props;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card px-6 py-10 shadow-sm sm:px-10">
      <BrandingBlobs />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="size-6" />
            <span className="text-sm font-semibold tracking-wide">{t("nav.guideBook")}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span dir="ltr" className="block">{headline}</span>
            <span dir="rtl" className="mt-1 block text-2xl font-semibold text-muted-foreground sm:text-3xl">{headlineAr}</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            <span dir="ltr" className="block">{subtitleEn}</span>
            <span dir="rtl" className="mt-2 block">{subtitleAr}</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="default" className="gap-1">
              <Sparkles className="size-3.5" />
              {roleLabel}
            </Badge>
            <Badge variant="outline">{t("guide.roleOnly", "Tailored to your sign-in role")}</Badge>
            <Badge variant="outline" className="gap-1">
              <Languages className="size-3.5" />
              EN + AR
            </Badge>
          </div>
        </div>
        <Card className="w-full shrink-0 border-dashed lg:max-w-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("guide.quickLinks", "Quick links")}</CardTitle>
            <CardDescription className="text-xs">
              <span dir="ltr">Modules you can access</span>
              <span className="mx-1">·</span>
              <span dir="rtl">الوحدات المتاحة لك</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {navKeys.map((k) => {
              const label = NAV_LABEL[k] ?? { en: k, ar: k };
              const path = NAV_ITEM_PATH[k] ?? "/";
              return (
                <Link key={k} to={path} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-primary hover:bg-muted/50">
                  <span dir="ltr">{label.en}</span>
                  <span dir="rtl" className="text-xs text-muted-foreground">{label.ar}</span>
                </Link>
              );
            })}
            <Link to="/front-desk/board" className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-primary hover:bg-muted/50">
              <span dir="ltr">Front desk board</span>
              <span dir="rtl" className="text-xs text-muted-foreground">لوحة الاستقبال</span>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BrandingBlobs() {
  return (
    <>
      <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl guide-wizard-playing" />
      <div className="pointer-events-none absolute -bottom-20 -start-10 size-56 rounded-full bg-kx-indigo-600/10 blur-3xl" />
    </>
  );
}

function MotionToolbar({
  showSplit,
  onToggle,
  sectionCount,
}: {
  showSplit: boolean;
  onToggle: () => void;
  sectionCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">
        <span dir="ltr">{sectionCount} guided sections</span>
        <span className="mx-2">·</span>
        <span dir="rtl">{sectionCount} أقسام إرشادية</span>
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onToggle}>
        <Languages className="me-1 size-4" />
        {showSplit ? "Side-by-side EN / AR" : "Stacked bilingual"}
      </Button>
    </div>
  );
}

function MotionSections({
  sections,
  showSplitBilingual,
}: {
  sections: GuideSection[];
  showSplitBilingual: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {sections.map((section, index) => (
        <SectionBlock
          key={section.id}
          section={section}
          index={index}
          showSplitBilingual={showSplitBilingual}
        />
      ))}
    </div>
  );
}