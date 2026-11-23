import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeReportingRange } from "@/lib/reporting-range";
import { useDateRangeStore } from "@/stores/date-range-store";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

export function DateRangeBar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { from, to, setRange, resetToCurrentMonth } = useDateRangeStore();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useSyncOnChange(
    [from, to],
    () => {
      setDraftFrom(from);
      setDraftTo(to);
    },
    { skipMount: true },
  );

  const apply = () => {
    const next = sanitizeReportingRange(draftFrom, draftTo);
    if (next.from !== draftFrom.trim() || next.to !== draftTo.trim()) {
      toast.error(t("dateRange.invalid", "Enter a valid from/to date range (from on or before to)."));
      setDraftFrom(next.from);
      setDraftTo(next.to);
    }
    setRange(next.from, next.to);
    void qc.invalidateQueries();
  };

  return (
    <div className="border-b border-border/70 bg-card/60 px-3 py-2 sm:px-4 md:px-6">
      <div className="mx-auto flex w-full min-w-0 max-w-[min(96rem,calc(100vw-1rem))] flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-4">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground rtl:normal-case rtl:tracking-normal md:me-auto md:self-center">
          {t("dateRange.label")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="range-from" className="text-xs text-muted-foreground">{t("dateRange.from")}</Label>
          <Input id="range-from" className="ltr-nums h-9 w-auto min-w-38 md:h-9" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          <Label htmlFor="range-to" className="text-xs text-muted-foreground">{t("dateRange.to")}</Label>
          <Input id="range-to" className="ltr-nums h-9 w-auto min-w-38 md:h-9" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          <Button type="button" size="sm" className="h-9 sm:h-9" onClick={apply}>
            {t("dateRange.apply")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 sm:h-9"
            onClick={() => {
              resetToCurrentMonth();
              void qc.invalidateQueries();
            }}
          >
            {t("dateRange.resetMonth")}
          </Button>
        </div>
      </div>
    </div>
  );
}
