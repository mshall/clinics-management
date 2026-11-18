import { useTranslation } from "react-i18next";
import { StaffInvitationsPanel } from "@/features/admin/staff-invitations-panel";

export function TeamPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("invitations.pageTitle")}</h1>
      <StaffInvitationsPanel />
    </div>
  );
}
