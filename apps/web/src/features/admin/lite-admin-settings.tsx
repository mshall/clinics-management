import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrgWhatsAppRemindersCard } from "./org-whatsapp-reminders-card";
import { EntitlementGate } from "@/components/entitlement-gate";
import { useClinicsQuery } from "@/lib/api-hooks";

export function LiteAdminSettings() {
  const { t } = useTranslation();
  const { data: clinics = [] } = useClinicsQuery();
  const primaryClinic = clinics[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("liteAdmin.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("liteAdmin.subtitle")}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/profile">{t("liteAdmin.profile")}</Link>
          </Button>
          {primaryClinic ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/clinics/${primaryClinic.id}`}>{t("liteAdmin.clinicHours")}</Link>
            </Button>
          ) : null}
          {primaryClinic ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/clinics/${primaryClinic.id}?panel=scheduling`}>{t("liteAdmin.appointmentTypes")}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <EntitlementGate entitlement="whatsapp_reminders" requiredPlan="PRO">
        <OrgWhatsAppRemindersCard />
      </EntitlementGate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("liteAdmin.marketplaceTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("liteAdmin.marketplaceHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}