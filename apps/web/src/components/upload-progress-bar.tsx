import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type UploadProgressBarProps = {
  /** 0–100 */
  percent: number;
  /** Optional label above the bar (defaults to localized “Uploading…”). */
  label?: string;
  className?: string;
  compact?: boolean;
};

/** Mini animated upload progress with percentage. */
export function UploadProgressBar({ percent, label, className, compact }: UploadProgressBarProps) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={cn("space-y-1.5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={label ?? t("common.uploading", "Uploading…")}
    >
      <div className={cn("flex items-center justify-between gap-2", compact ? "text-[11px]" : "text-xs")}>
        <span className="font-medium text-foreground">
          {label ?? t("common.uploading", "Uploading…")}
        </span>
        <span className="tabular-nums font-semibold text-primary ltr-nums">{clamped}%</span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2")}>
        <div
          className="h-full rounded-full bg-linear-to-r from-sky-500 via-teal-500 to-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
