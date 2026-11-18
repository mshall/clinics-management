import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { filterActionsClassName, filterFieldClassName, filterToolbarClassName } from "@/lib/form-control-styles";
import { sanitizeReportingRange } from "@/lib/reporting-range";
import { useDateRangeStore } from "@/stores/date-range-store";

export function DateRangeBar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { from, to, setRange, resetToCurrentMonth } = useDateRangeStore();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
  }, [from, to]);

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
    <div className="border-b border-border bg-muted/30 px-3 py-3 sm:px-4 md:px-6">
      <div className="mx-auto flex w-full min-w-0 max-w-[min(96rem,calc(100vw-1rem))] flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
        <p className="shrink-0 text-xs font-medium text-muted-foreground md:me-auto md:self-center md:text-sm">
          {t("dateRange.label")}
        </p>
        <div className={filterToolbarClassName}>
          <div className={filterFieldClassName}>
            <Label htmlFor="range-from" className="text-xs">
              {t("dateRange.from")}
            </Label>
            <Input id="range-from" className="ltr-nums" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div className={filterFieldClassName}>
            <Label htmlFor="range-to" className="text-xs">
              {t("dateRange.to")}
            </Label>
            <Input id="range-to" className="ltr-nums" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <div className={filterActionsClassName}>
            <Button type="button" size="sm" className="h-11 w-full min-[420px]:w-auto" onClick={apply}>
              {t("dateRange.apply")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-11 w-full min-[420px]:w-auto"
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
    </div>
  );
}
