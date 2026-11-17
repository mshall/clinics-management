import { type ReactNode, useState } from "react";
import { UpgradeHint } from "@/components/upgrade-hint";
import { useEntitlement } from "@/hooks/use-entitlement";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

type Props = {
  entitlement: string;
  requiredPlan?: string;
  fallback?: ReactNode;
  children: ReactNode;
};

export function EntitlementGate({ entitlement, requiredPlan, fallback, children }: Props) {
  const allowed = useEntitlement(entitlement);
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  if (allowed) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <>
      <UpgradeHint entitlement={entitlement} requiredPlan={requiredPlan} onUpgrade={() => setModalOpen(true)} />
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("entitlements.modalTitle", "Upgrade your plan")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                "entitlements.modalDescription",
                "This capability requires a higher plan. Organization owners can change plan under Admin → Plan & billing.",
              )}
            </p>
          </DialogHeader>
          <UpgradeHint entitlement={entitlement} requiredPlan={requiredPlan} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Alias per PL-03 acceptance naming. */
export const Gate = EntitlementGate;