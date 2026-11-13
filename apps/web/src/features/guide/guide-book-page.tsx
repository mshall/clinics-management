import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { guideForRole, type GuideSection } from "@/features/guide/role-guide-content";
import { formatUserRole } from "@/lib/locale-display";
import { mapApiRole, type DemoRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const SECTION_ACCENTS = [
  "from-violet-500/15 via-transparent to-transparent",
  "from-sky-500/15 via-transparent to-transparent",
  "from-emerald-500/15 via-transparent to-transparent",
  "from-amber-500/15 via-transparent to-transparent",
];

function SectionBlock({
  section,
  index,
  isAr,
}: {
  section: GuideSection;
  index: number;
  isAr: boolean;
}) {
  const title = isAr ? section.titleAr : section.titleEn;
  const summary = isAr ? section.summaryAr : section.summaryEn;
  const tips = isAr ? section.tipsAr : section.tipsEn;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className={cn("h-1 w-full bg-gradient-to-r", SECTION_ACCENTS[index % SECTION_ACCENTS.length] ?? SECTION_ACCENTS[0])} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-relaxed">{summary}</CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 font-mono text-xs">
            {String(index + 1).padStart(2, "0")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {section.steps.map((step, si) => {
            const stepTitle = isAr ? step.titleAr : step.titleEn;
            const stepBody = isAr ? step.bodyAr : step.bodyEn;
            return (
              <li
                key={`${section.id}-${si}`}
                className="flex gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ltr-nums">
                  {si + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{stepTitle}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{stepBody}</p>
                  {step.path ? (
                    <Button variant="link" className="h-auto px-0 pt-2 text-sm" asChild>
                      <Link to={step.path}>
                        {isAr ? "افتح في التطبيق" : "Open in app"}
                        <ChevronRight className="ms-1 size-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {tips?.length ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <Lightbulb className="size-4" />
              {isAr ? "نصائح" : "Pro tips"}
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {tips.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GuideBookPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAr = i18n.language.startsWith("ar");
  const role = user?.role ? mapApiRole(user.role) : undefined;
  const guide = guideForRole(role);

  const headline = isAr ? guide.headlineAr : guide.headlineEn;
  const roleLabel = formatUserRole(user?.role ?? "", t);

  return (
    <div className="space-y-8 pb-10">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card px-6 py-10 shadow-sm sm:px-10">
        <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -start-10 size-56 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="size-6" />
              <span className="text-sm font-semibold tracking-wide">{t("nav.guideBook")}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{headline}</h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {isAr ? guide.subtitleAr : guide.subtitleEn}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="default" className="gap-1">
                <Sparkles className="size-3.5" />
                {roleLabel}
              </Badge>
              <Badge variant="outline">{t("guide.roleOnly", "Tailored to your sign-in role")}</Badge>
            </div>
          </div>
          <Card className="w-full shrink-0 border-dashed sm:max-w-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("guide.quickLinks", "Quick links")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <RoleQuickLinks role={role} isAr={isAr} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {guide.sections.map((section, index) => (
          <SectionBlock key={section.id} section={section} index={index} isAr={isAr} />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t(
          "guide.footer",
          "For technical RFC/PRD detail, see the documentation portal in the repository Docs folder.",
        )}
      </p>
    </div>
  );
}

function RoleQuickLinks({ role, isAr }: { role: DemoRole | undefined; isAr: boolean }) {
  const links: { to: string; en: string; ar: string }[] = [];
  const add = (to: string, en: string, ar: string) => links.push({ to, en, ar });

  switch (role) {
    case "platform_super_admin":
      add("/platform", "Platform", "المنصة");
      break;
    case "physician":
      add("/encounters", "Encounters", "الزيارات");
      add("/clinical/templates", "Templates", "القوالب");
      break;
    case "receptionist":
    case "clinic_assistant":
      add("/front-desk/board", "Front desk board", "لوحة الاستقبال");
      add("/appointments", "Appointments", "المواعيد");
      break;
    case "finance_officer":
      add("/revenue", "Revenue", "الإيرادات");
      add("/reports", "Reports", "التقارير");
      break;
    case "hr_officer":
      add("/hr", "HR", "الموارد البشرية");
      break;
    case "call_center":
      add("/customer-support", "Support", "الدعم");
      break;
    default:
      add("/", "Dashboard", "لوحة المعلومات");
      add("/patients", "Patients", "المرضى");
  }

  return (
    <>
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="text-primary hover:underline">
          {isAr ? l.ar : l.en}
        </Link>
      ))}
    </>
  );
}
