import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { UpgradeHint } from "@/components/upgrade-hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trackPaywallEvent } from "@/lib/paywall-analytics";
import { useUpgradePaywallStore } from "@/stores/upgrade-paywall-store";
import { useAuthStore } from "@/stores/auth-store";

function canManageOrgBilling(user: ReturnType<typeof useAuthStore.getState>["user"]): boolean {
  if (!user) return false;
  return (
    user.role === "group_admin" ||
    user.role === "finance_officer" ||
    Boolean(user.isTenantOwner)
  );
}

export function UpgradePaywallModal() {
  const { t } = useTranslation();
  const open = useUpgradePaywallStore((s) => s.open);
  const payload = useUpgradePaywallStore((s) => s.payload);
  const source = useUpgradePaywallStore((s) => s.source);
  const hide = useUpgradePaywallStore((s) => s.hide);
  const user = useAuthStore((s) => s.user);
  const ownerCapable = canManageOrgBilling(user);

  useEffect(() => {
    if (open && payload) {
      trackPaywallEvent("view", payload, source);
    }
  }, [open, payload, source]);

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("entitlements.modalTitle", "Upgrade your plan")}</DialogTitle>
        </DialogHeader>
        <UpgradeHint entitlement={payload.entitlement} requiredPlan={payload.requiredPlan} />
        {ownerCapable ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" asChild onClick={() => trackPaywallEvent("conversion_intent", payload, source)}>
              <Link to="/admin" onClick={() => hide()}>
                {t("paywall.goToBilling", "Plan & billing")}
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => hide()}>
              {t("common.close", "Close")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("paywall.askOwner", "Ask your clinic owner to upgrade under Admin → Plan & billing.")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}