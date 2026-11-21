import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { type RxSafetyAlert } from "@/features/clinical/rx-safety-utils";

function severityClass(severity: string): string {
  switch (severity) {
    case "contraindicated":
      return "border-red-600/50 bg-red-500/15 text-[hsl(var(--danger-text))] ";
    case "major":
      return "border-orange-600/50 bg-orange-500/15 text-[hsl(var(--warning))] ";
    case "moderate":
      return "border-amber-600/50 bg-amber-500/15 text-[hsl(var(--warning))] ";
    case "minor":
      return "border-kx-ocean-700/40 bg-kx-ocean-600/10 text-kx-ocean-950 dark:text-kx-ocean-100";
    case "unavailable":
    case "info":
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

type Props = { alerts: RxSafetyAlert[]; className?: string };

export function RxSafetyAlerts({ alerts, className }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  if (!alerts.length) return null;

  return (
    <ul className={cn("space-y-1.5 text-xs", className)}>
      {alerts.map((w, i) => (
        <li key={i} className={cn("rounded-md border px-2 py-1.5", severityClass(w.severity))}>
          <span className="font-medium uppercase tracking-wide opacity-80">
            {t(`clinical.rxSeverity.${w.severity}`, w.severity)}
            {w.kind === "unavailable"
              ? ` · ${t("clinical.safetyUnavailableShort", "Not checked")}`
              : w.kind
                ? ` · ${t(`clinical.rxKind.${w.kind}`, w.kind)}`
                : null}
          </span>
          <p className="mt-0.5">{isAr && w.messageAr ? w.messageAr : w.messageEn}</p>
          {w.requiresOverride ? (
            <p className="mt-1 font-medium">{t("clinical.rxOverrideRequired", "Override reason required to save.")}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
