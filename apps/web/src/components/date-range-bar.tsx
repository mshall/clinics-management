import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    setRange(draftFrom, draftTo);
    void qc.invalidateQueries();
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-muted/30 px-4 py-3 md:flex-row md:flex-wrap md:items-end md:gap-4 md:px-6">
      <p className="text-xs font-medium text-muted-foreground md:me-auto md:self-center md:text-sm">{t("dateRange.label")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="range-from" className="text-xs">
            {t("dateRange.from")}
          </Label>
          <Input
            id="range-from"
            className="h-9 w-[11rem] ltr-nums"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-to" className="text-xs">
            {t("dateRange.to")}
          </Label>
          <Input
            id="range-to"
            className="h-9 w-[11rem] ltr-nums"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" className="h-9" onClick={apply}>
          {t("dateRange.apply")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => {
            resetToCurrentMonth();
            void qc.invalidateQueries();
          }}
        >
          {t("dateRange.resetMonth")}
        </Button>
      </div>
    </div>
  );
}
