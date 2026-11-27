import { Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isFlagOn, useEffectiveFlags } from "@/features/flags/use-effective-flags";
import "./pay-i18n";
import { PAY_FLAG } from "./pay-api";
import { PayLinksPanel } from "./PayLinksPanel";
import { PayMatchingPanel } from "./PayMatchingPanel";
import { PayRefundsPanel } from "./PayRefundsPanel";
import { PayRollupPanel } from "./PayRollupPanel";

/** Kiorly Pay collections for staff: invoice matching, payment links and status, refund requests, rollup. Behind `clinic.pay_collections` (launch-locked, off until the gate is recorded). Mock providers only. */
export function PayPage() {
  const { t } = useTranslation();
  const flags = useEffectiveFlags();
  if (flags.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("pay.loading")}</p>;
  if (!isFlagOn(flags.data, PAY_FLAG)) {
    return <Card data-testid="pay-unavailable"><CardContent className="p-6 text-sm text-muted-foreground">{t("pay.unavailable")}</CardContent></Card>;
  }
  return (
    <div className="space-y-4" data-testid="pay-page">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Landmark className="size-4" aria-hidden />{t("pay.title")}</CardTitle>
          <CardDescription>{t("pay.intro")}</CardDescription>
        </CardHeader>
        <CardContent><p className="text-xs text-muted-foreground" data-testid="pay-mock-note">{t("pay.mockNote")}</p></CardContent>
      </Card>
      <Tabs defaultValue="matching">
        <TabsList>
          <TabsTrigger value="matching" data-testid="pay-tab-matching">{t("pay.tabs.matching")}</TabsTrigger>
          <TabsTrigger value="links" data-testid="pay-tab-links">{t("pay.tabs.links")}</TabsTrigger>
          <TabsTrigger value="refunds" data-testid="pay-tab-refunds">{t("pay.tabs.refunds")}</TabsTrigger>
          <TabsTrigger value="rollup" data-testid="pay-tab-rollup">{t("pay.tabs.rollup")}</TabsTrigger>
        </TabsList>
        <TabsContent value="matching"><PayMatchingPanel /></TabsContent>
        <TabsContent value="links"><PayLinksPanel /></TabsContent>
        <TabsContent value="refunds"><PayRefundsPanel /></TabsContent>
        <TabsContent value="rollup"><PayRollupPanel /></TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">{t("pay.principle")}</p>
    </div>
  );
}
