import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderPageProps {
  titleKey: string;
  subtitleKey: string;
}

export function PlaceholderPage({ titleKey, subtitleKey }: PlaceholderPageProps) {
  const { t } = useTranslation();

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t(titleKey)}</CardTitle>
        <CardDescription>{t(subtitleKey)}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t("common.comingSoon")}</p>
      </CardContent>
    </Card>
  );
}
