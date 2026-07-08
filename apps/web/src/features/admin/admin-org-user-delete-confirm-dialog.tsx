import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { formatUserRole } from "@/lib/locale-display";

export type OrgUserDeleteTarget = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  clinics?: { id: string; nameEn: string }[];
  clinicLabel?: string | null;
};

type AdminOrgUserDeleteConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: OrgUserDeleteTarget | null;
  pending?: boolean;
  onConfirm: () => void;
};

export function AdminOrgUserDeleteConfirmDialog({
  open,
  onOpenChange,
  user,
  pending = false,
  onConfirm,
}: AdminOrgUserDeleteConfirmDialogProps) {
  const { t } = useTranslation();

  const clinicLabel =
    user?.clinicLabel ??
    (user?.clinics?.length
      ? user.clinics.map((c) => c.nameEn).join(", ")
      : t("admin.orgUsersNoClinics", "Organization-wide"));

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={t("admin.orgUsersDeleteConfirmTitle", "Delete user?")}
      description={t(
        "admin.orgUsersDeleteConfirmIntro",
        "This login account will be permanently removed from your organization. This action cannot be undone.",
      )}
      confirmLabel={t("admin.orgUsersDeleteConfirmAction", "Delete user")}
      cancelLabel={t("common.cancel", "Cancel")}
      pending={pending}
      onConfirm={onConfirm}
      details={
        user ? (
          <dl className="space-y-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("admin.displayName", "Display name")}
              </dt>
              <dd className="font-medium text-foreground">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("auth.email", "Email")}
              </dt>
              <dd className="break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("admin.role", "Role")}
              </dt>
              <dd>{formatUserRole(user.role, t)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("admin.assignedClinics", "Assigned clinics")}
              </dt>
              <dd>{clinicLabel}</dd>
            </div>
          </dl>
        ) : null
      }
    />
  );
}
