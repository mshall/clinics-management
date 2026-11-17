import { UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatUserRole } from "@/lib/locale-display";
import type { DemoRole } from "@/lib/roles";

export type OrgUserRoleChangeTarget = {
  userId: string;
  displayName: string;
  email: string;
  fromRole: DemoRole;
  toRole: DemoRole;
};

type AdminOrgUserRoleChangeConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: OrgUserRoleChangeTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

export function AdminOrgUserRoleChangeConfirmDialog({
  open,
  onOpenChange,
  target,
  pending = false,
  onConfirm,
}: AdminOrgUserRoleChangeConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      variant="default"
      icon={<UserCog className="h-5 w-5" aria-hidden />}
      title={t("admin.orgUserRoleChangeConfirmTitle", "Change primary role?")}
      description={t(
        "admin.orgUserRoleChangeConfirmIntro",
        "This updates the user’s primary role and resets sidebar access, money visibility, and additional roles to the defaults for the new role. Other permission tweaks on this screen are only previews until you save them separately.",
      )}
      confirmLabel={t("admin.orgUserRoleChangeConfirmAction", "Confirm role change")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        target ? (
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("admin.displayName", "Display name")}
              </dt>
              <dd className="font-medium text-foreground">{target.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("auth.email", "Email")}
              </dt>
              <dd className="break-all text-sm">{target.email}</dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.orgUserRoleChangeFrom", "Current role")}
                </dt>
                <dd className="mt-1 font-medium">{formatUserRole(target.fromRole, t)}</dd>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.orgUserRoleChangeTo", "New role")}
                </dt>
                <dd className="mt-1 font-medium text-primary">{formatUserRole(target.toRole, t)}</dd>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(
                "admin.orgUserRoleChangeResetNote",
                "Navigation tabs, money visibility overrides, additional roles, and delegated HR clinic access will be cleared.",
              )}
            </p>
          </dl>
        ) : null
      }
    />
  );
}