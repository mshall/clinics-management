import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/http";

export type PriceImpactPreview = {
  noticeDays: number;
  currency: string;
  tenantsAffected: number;
  lockedTenants: number;
  mrrBefore: string;
  mrrAfter: string;
  mrrDelta: string;
  rows: Array<{
    tenantId: string;
    tenantName: string;
    subscriptionId: string;
    fromMonthly: string;
    toMonthly: string;
    monthlyDelta: string;
    currency: string;
    effectiveAt: string;
    noticeDueAt: string;
    lockedUntil: string | null;
  }>;
};

type PriceMigrationRow = {
  id: string;
  tenantName: string;
  planKey: string;
  fromVersion: number;
  toVersion: number;
  fromMonthly: string;
  toMonthly: string;
  currency: string;
  status: string;
  noticeSentAt: string | null;
  effectiveAt: string;
  priceLockUntil: string | null;
};

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

/** SB-06: tenants affected + MRR delta before publishing a new price version. */
export function PriceImpactPanel({ impact }: { impact: PriceImpactPreview }) {
  const { t } = useTranslation();
  const delta = Number(impact.mrrDelta);
  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm" data-testid="price-impact-preview">
      <p className="font-medium">{t("platform.plans.impactTitle")}</p>
      <dl className="grid gap-2 sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">{t("platform.plans.tenantsAffected")}</dt>
          <dd className="font-semibold ltr-nums">{impact.tenantsAffected}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("platform.plans.lockedTenants")}</dt>
          <dd className="font-semibold ltr-nums">{impact.lockedTenants}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("platform.plans.mrrBefore")}</dt>
          <dd className="ltr-nums">
            {impact.mrrBefore} {impact.currency}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("platform.plans.mrrAfter")}</dt>
          <dd className="ltr-nums">
            {impact.mrrAfter} {impact.currency}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("platform.plans.mrrDelta")}</dt>
          <dd className={`font-semibold ltr-nums ${delta > 0 ? "text-[hsl(var(--success))]" : delta < 0 ? "text-destructive" : ""}`}>
            {delta > 0 ? "+" : ""}
            {impact.mrrDelta} {impact.currency}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t("platform.plans.noticeDays", { count: impact.noticeDays })}</p>
      {impact.rows.length === 0 ? (
        <p className="text-muted-foreground">{t("platform.plans.noImpact")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("platform.plans.colTenant")}</TableHead>
              <TableHead className="text-end">{t("platform.plans.colFrom")}</TableHead>
              <TableHead className="text-end">{t("platform.plans.colTo")}</TableHead>
              <TableHead>{t("platform.plans.colNotice")}</TableHead>
              <TableHead>{t("platform.plans.colMoves")}</TableHead>
              <TableHead>{t("platform.plans.colLocked")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {impact.rows.slice(0, 50).map((r) => (
              <TableRow key={r.subscriptionId}>
                <TableCell className="text-xs">{r.tenantName}</TableCell>
                <TableCell className="text-end text-xs ltr-nums">
                  {r.fromMonthly} {r.currency}
                </TableCell>
                <TableCell className="text-end text-xs ltr-nums">
                  {r.toMonthly} {r.currency}
                </TableCell>
                <TableCell className="text-xs ltr-nums">{day(r.noticeDueAt)}</TableCell>
                <TableCell className="text-xs ltr-nums">{day(r.effectiveAt)}</TableCell>
                <TableCell className="text-xs ltr-nums">{day(r.lockedUntil)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** SB-06 admin report: who moves when. */
export function PlatformPriceMigrationsCard() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["platform", "plans", "price-migrations"],
    queryFn: () => apiGet<{ items: PriceMigrationRow[] }>("/api/v1/admin/platform/plans/price-migrations"),
  });
  const items = query.data?.items ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("platform.plans.migrationsTitle")}</CardTitle>
        <CardDescription>{t("platform.plans.migrationsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("platform.plans.migrationsEmpty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("platform.plans.colTenant")}</TableHead>
                <TableHead>{t("platform.plans.colStatus")}</TableHead>
                <TableHead className="text-end">{t("platform.plans.colFrom")}</TableHead>
                <TableHead className="text-end">{t("platform.plans.colTo")}</TableHead>
                <TableHead>{t("platform.plans.colMoves")}</TableHead>
                <TableHead>{t("platform.plans.colLocked")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">
                    {m.tenantName}
                    <span className="block font-mono text-muted-foreground">
                      {m.planKey} v{m.fromVersion} → v{m.toVersion}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`platform.plans.migrationStatus_${m.status}`, m.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-end text-xs ltr-nums">
                    {m.fromMonthly} {m.currency}
                  </TableCell>
                  <TableCell className="text-end text-xs ltr-nums">
                    {m.toMonthly} {m.currency}
                  </TableCell>
                  <TableCell className="text-xs ltr-nums">{day(m.effectiveAt)}</TableCell>
                  <TableCell className="text-xs ltr-nums">{day(m.priceLockUntil)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
