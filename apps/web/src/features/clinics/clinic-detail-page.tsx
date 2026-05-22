import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClinicDoctorsPanel } from "@/features/clinics/clinic-doctors-panel";
import { useClinicQuery } from "@/lib/api-hooks";

export function ClinicDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const { data: c, isPending, isError, error } = useClinicQuery(id);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (isError || !c) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : t("common.error")}</p>
        <Button asChild variant="outline">
          <Link to="/clinics">{t("nav.clinics")}</Link>
        </Button>
      </div>
    );
  }

  const name = i18n.language === "ar" ? c.nameAr : c.nameEn;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge variant={c.kind === "parent" ? "default" : "outline"}>
              {c.kind === "parent" ? t("clinics.parent") : t("clinics.branch")}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {c.city}, {c.country}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/clinics">{t("common.back", "Back to list")}</Link>
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("clinics.tabOverview", "Overview")}</TabsTrigger>
          <TabsTrigger value="doctors">{t("clinics.tabDoctors", "Doctors assigned")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.detailRegistration", "Registration")}</CardTitle>
                <CardDescription>{t("clinics.detailRegistrationHint", "Values entered when the clinic was added.")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("clinics.licenseNumber", "License")}: </span>
                  <span className="font-medium">{c.licenseNumber}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.phone", "Phone")}: </span>
                  <span className="ltr-nums font-medium">{c.phone}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.email", "Email")}: </span>
                  <span className="font-medium">{c.email}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">{t("clinics.defaultLanguage", "Default language")}: </span>
                  <span className="font-medium">{c.defaultLanguage}</span>
                </p>
                {c.logoUrl ? (
                  <p>
                    <span className="text-muted-foreground">Logo URL: </span>
                    <span className="break-all text-xs">{c.logoUrl}</span>
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.detailLocation", "Location & addresses")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.addressEn", "Address (EN)")}</p>
                  <p>{c.addressEn}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.addressAr", "Address (AR)")}</p>
                  <p dir="rtl">{c.addressAr}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("clinics.locationUrl", "Map link")}</p>
                  <a href={c.locationUrl} className="text-primary underline break-all" target="_blank" rel="noreferrer">
                    {c.locationUrl}
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          {c.parentClinicId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("clinics.parentClinic", "Parent clinic")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{i18n.language === "ar" ? c.parentNameAr : c.parentNameEn}</p>
                <Button asChild variant="link" className="h-auto px-0">
                  <Link to={`/clinics/${c.parentClinicId}`}>{t("clinics.viewParent", "View parent")}</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="doctors">
          <ClinicDoctorsPanel clinicId={c.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
