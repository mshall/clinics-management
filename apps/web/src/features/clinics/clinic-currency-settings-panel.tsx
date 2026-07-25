import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BaseCurrencySelect } from "@/components/base-currency-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ApiError, apiPatch } from "@/lib/http";

type ClinicCurrencySettingsPanelProps = {
  clinicId: string;
  defaultCurrency: string;
  canEdit: boolean;
};

export function ClinicCurrencySettingsPanel({
  clinicId,
  defaultCurrency,
  canEdit,
}: ClinicCurrencySettingsPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [currency, setCurrency] = useState(defaultCurrency);

  useEffect(() => {
    setCurrency(defaultCurrency);
  }, [defaultCurrency]);

  const saveMut = useMutation({
    mutationFn: () => apiPatch(`/api/v1/clinics/${clinicId}`, { defaultCurrency: currency }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      toast.success(t("clinics.currencySaved", "Default currency updated."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.currencySettings", "Currency")}</CardTitle>
        <CardDescription>
          {t(
            "clinics.currencySettingsHint",
            "Default currency for fees, revenue display, and new records at this clinic. Staff can still choose another supported currency when posting amounts.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="clinic-default-currency">{t("admin.defaultCurrency", "Default currency")}</Label>
          {canEdit ? (
            <BaseCurrencySelect id="clinic-default-currency" value={currency} onChange={setCurrency} />
          ) : (
            <p className="flex min-h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium">
              {defaultCurrency}
            </p>
          )}
        </div>
        {canEdit ? (
          <Button
            type="button"
            disabled={saveMut.isPending || currency === defaultCurrency}
            onClick={() => saveMut.mutate()}
          >
            {t("common.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
