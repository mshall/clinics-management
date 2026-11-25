import { useTranslation } from "react-i18next";
import { PageHeader } from "@/brand/ui-kit";
import { AdminKiorexCommissionsPanel } from "./admin-kiorex-commissions-panel";

/** COM-1: stand-alone route /kiorex-commissions so finance users (who have no Administration menu) can open the panel; the panel and the API decide who sees figures. */
export function KiorexCommissionsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("kiorexCom.title")} />
      <AdminKiorexCommissionsPanel standalone />
    </div>
  );
}
