import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/http";

type Addon = { key: string; nameEn: string; nameAr: string; monthlyAmount: number };

export function AdminSpecialtyPacksCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["billing", "addons"],
    queryFn: () => apiGet<Addon[]>("/api/v1/billing/addons"),
  });
  const buy = useMutation({
    mutationFn: (entitlementKey: string) =>
      apiPost("/api/v1/billing/addons/purchase", { entitlementKey }),
    onSuccess: () => {
      toast.success(t("specialtyPacks.purchased"));
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card data-testid="specialty-packs-card">
      <CardHeader>
        <CardTitle className="text-base">{t("specialtyPacks.title")}</CardTitle>
        <CardDescription>{t("specialtyPacks.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          (query.data ?? []).map((a) => (
            <div key={a.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {i18n.language.startsWith("ar") ? a.nameAr || a.nameEn : a.nameEn}
                <span className="text-muted-foreground"> · {a.monthlyAmount}/mo</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={buy.isPending}
                onClick={() => buy.mutate(a.key)}
              >
                {t("specialtyPacks.purchase")}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
