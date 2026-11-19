import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ExportProgressState = {
  open: boolean;
  title: string;
  detail?: string;
  percent: number;
  status: "running" | "ready" | "failed";
  error?: string | null;
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
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="export-progress-desc">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription id="export-progress-desc">
            {state.status === "failed"
              ? state.error || t("common.error")
              : state.detail ||
                (state.status === "ready"
                  ? t("admin.exportProgressReady", "File is ready. Your download should start shortly.")
                  : t(
                      "admin.exportProgressWorking",
                      "Preparing your file in the background. You can close this dialog — we will notify you when it is ready.",
                    ))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {state.status === "ready"
                ? t("admin.exportProgressDone", "Complete")
                : state.status === "failed"
                  ? t("admin.exportProgressFailed", "Failed")
                  : t("admin.exportProgressPercent", "{{percent}}% complete", { percent: pct })}
            </span>
            <span className="font-mono ltr-nums tabular-nums font-medium">{pct}%</span>
          </div>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                state.status === "failed" ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {state.status === "running" ? (
            <p className="text-xs text-muted-foreground">
              {t(
                "admin.exportProgressBackgroundHint",
                "This runs as a background job so large backups do not time out in the browser.",
              )}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
