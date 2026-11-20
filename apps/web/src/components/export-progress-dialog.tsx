import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ExportProgressState = {
  open: boolean;
  title: string;
  detail?: string;
  percent: number;
  status: "running" | "ready" | "failed";
  error?: string | null;
  /** Drives import vs export copy and icons. */
  mode?: "export" | "import";
};

export function ExportProgressDialog({
  state,
  onOpenChange,
}: {
  state: ExportProgressState;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(100, Math.round(state.percent)));
  const mode = state.mode ?? "export";
  const isImport = mode === "import";

  const headerTone =
    state.status === "failed"
      ? "border-destructive/25 bg-gradient-to-br from-destructive/10 via-destructive/5 to-transparent dark:from-destructive/15"
      : state.status === "ready"
        ? "border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/15"
        : isImport
          ? "border-sky-500/25 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent dark:from-sky-500/15"
          : "border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent dark:from-violet-500/15";

  const iconWrap =
    state.status === "failed"
      ? "bg-destructive/15 text-destructive ring-destructive/10"
      : state.status === "ready"
        ? "bg-emerald-500/20 text-emerald-800 ring-emerald-500/10 dark:text-emerald-200"
        : isImport
          ? "bg-sky-500/20 text-sky-800 ring-sky-500/10 dark:text-sky-200"
          : "bg-violet-500/20 text-violet-800 ring-violet-500/10 dark:text-violet-200";

  const barClass =
    state.status === "failed"
      ? "bg-destructive"
      : state.status === "ready"
        ? "bg-emerald-500"
        : isImport
          ? "bg-sky-500"
          : "bg-violet-500";

  const Icon =
    state.status === "failed"
      ? AlertTriangle
      : state.status === "ready"
        ? CheckCircle2
        : isImport
          ? Upload
          : Download;

  const statusLabel =
    state.status === "ready"
      ? isImport
        ? t("admin.importProgressDone", "Import complete")
        : t("admin.exportProgressDone", "Complete")
      : state.status === "failed"
        ? isImport
          ? t("admin.importProgressFailed", "Import failed")
          : t("admin.exportProgressFailed", "Failed")
        : t("admin.exportProgressPercent", "{{percent}}% complete", { percent: pct });

  const description =
    state.status === "failed"
      ? t(
          "admin.importProgressFailedHint",
          "The job stopped before finishing. Review the error below, then try again with a valid backup file.",
        )
      : state.detail ||
        (state.status === "ready"
          ? isImport
            ? t("admin.importProgressReady", "Import finished.")
            : t("admin.exportProgressReady", "File is ready. Your download should start shortly.")
          : isImport
            ? t("admin.importProgressWorking", "Restoring SQL and files in the background…")
            : t(
                "admin.exportProgressWorking",
                "Preparing your file in the background. You can close this dialog — we will notify you when it is ready.",
              ));

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="export-progress-desc"
        data-testid={isImport ? "import-progress-dialog" : "export-progress-dialog"}
      >
        <div className={cn("border-b px-6 py-5", headerTone)}>
          <DialogHeader className="space-y-3 text-start">
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-full ring-4", iconWrap)}>
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">{state.title}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p id="export-progress-desc" className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>

          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {statusLabel}
                </p>
                <p
                  className={cn(
                    "mt-1 text-3xl font-semibold leading-none ltr-nums tabular-nums",
                    state.status === "failed"
                      ? "text-destructive"
                      : state.status === "ready"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-foreground",
                  )}
                  data-testid="backup-progress-percent"
                >
                  {pct}%
                </p>
              </div>
              {state.status === "running" ? (
                <span className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden />
                  {t("admin.backupProgressLive", "In progress")}
                </span>
              ) : null}
            </div>

            <div
              className="h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barClass)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {state.status === "failed" && state.error ? (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              data-testid="backup-progress-error"
              role="alert"
            >
              <p className="font-semibold">
                {isImport
                  ? t("admin.importProgressErrorTitle", "Why import failed")
                  : t("admin.exportProgressErrorTitle", "Why export failed")}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{state.error}</p>
            </div>
          ) : null}

          {state.status === "running" ? (
            <p className="text-xs text-muted-foreground">
              {isImport
                ? t(
                    "admin.importProgressBackgroundHint",
                    "You can close this dialog — the restore keeps running in the background. Re-open from Recent backup jobs if needed.",
                  )
                : t(
                    "admin.exportProgressBackgroundHint",
                    "This runs as a background job so large backups do not time out in the browser.",
                  )}
            </p>
          ) : null}

          {state.status === "failed" || state.status === "ready" ? (
            <div className="flex justify-end pt-1">
              <Button type="button" variant={state.status === "failed" ? "outline" : "default"} onClick={() => onOpenChange(false)}>
                {t("common.close", "Close")}
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
