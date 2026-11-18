import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";

type ListingRow = {
  id: string;
  clinicianName: string;
  status: string;
  pausedReason: string | null;
  blockers: string[];
  completenessPercent: number;
};

type Props = { clinicId: string };

const tone: Record<string, string> = {
  LIVE: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  PAUSED: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
  PENDING_VERIFICATION: "bg-blue-500/15 text-blue-900",
  DRAFT: "bg-muted text-muted-foreground",
};

export function ClinicKiorexListingsPanel({ clinicId }: Props) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["marketplace", "listings", clinicId],
    queryFn: () => apiGet<ListingRow[]>(`/api/v1/marketplace/listings?clinicId=${encodeURIComponent(clinicId)}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("kiorex.listings.title", "Kiorex doctor listings")}</CardTitle>
        <CardDescription>
          {t("kiorex.listings.hint", "Each doctor must be verified, billable, and have marketplace types plus availability before going LIVE.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {(q.data ?? []).map((row) => (
            <li key={row.id} className="rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.clinicianName}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground ltr-nums">
                    {t("kiorex.listings.completeness", "Profile")} {row.completenessPercent}%
                  </span>
                  <Badge variant="secondary" className={tone[row.status] ?? ""}>
                    {t(`kiorex.listings.status.${row.status}`, row.status)}
                  </Badge>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link to={`/clinics/${clinicId}/kiorex-listings/${row.id}/profile`}>
                      {t("kiorex.profile.edit", "Edit profile")}
                    </Link>
                  </Button>
                </div>
              </div>
              {row.blockers.length > 0 ? (
                <ul className="mt-2 list-disc ps-5 text-xs text-muted-foreground">
                  {row.blockers.map((b) => (
                    <li key={b}>{t(`kiorex.listings.blocker.${b}`, b)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        {!q.data?.length ? (
          <p className="text-sm text-muted-foreground">{t("kiorex.listings.empty", "No physicians assigned to this branch yet.")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}