import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePlanKey } from "@/hooks/use-entitlement";

type Props = {
  entitlement: string;
  requiredPlan?: string;
  onUpgrade?: () => void;
};

export function UpgradeHint({ entitlement, requiredPlan, onUpgrade }: Props) {
  const { t } = useTranslation();
  const currentPlan = usePlanKey();
  const target = requiredPlan ?? "PRO";

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm">
      <p className="font-medium">{t("entitlements.upgradeTitle", "Upgrade required")}</p>
      <p className="mt-1 text-muted-foreground">
        {t(
          "entitlements.upgradeBody",
          "{{feature}} is not included on your {{current}} plan. Upgrade to {{target}} to unlock it.",
          {
            feature: entitlement,
            current: currentPlan ?? t("entitlements.currentPlan", "current"),
            target,
          },
        )}
      </p>
      {onUpgrade ? (
        <Button type="button" size="sm" className="mt-3" onClick={onUpgrade}>
          {t("entitlements.upgradeCta", "View plans")}
        </Button>
      ) : (
        <Button type="button" size="sm" className="mt-3" variant="outline" asChild>
          <a href="/admin">{t("entitlements.upgradeCta", "View plans")}</a>
        </Button>
      )}
    </div>
  );
}