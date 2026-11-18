import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { AdminKiorexFreeProgressCard } from "./admin-kiorex-free-progress-card";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ChargeRow = {
  id: string;
  attendedAt: string;
  clinicianName: string;
  patientInitials: string;
  amount: string;
  currency: string;
  status: string;
  canDispute: boolean;
};

type ChargeList = {
  items: ChargeRow[];
  total: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "muted"> = {
  PENDING: "secondary",
  CONFIRMED: "default",
  DISPUTED: "muted",
  REVERSED: "outline",
  WAIVED: "outline",
  BILLED: "default",
};

function defaultPeriod(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function AdminKiorexChargesPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(defaultPeriod);
  const [status, setStatus] = useState("");

  const queryKey = useMemo(() => ["billing", "kiorex-charges", period, status], [period, status]);

  const listQuery = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: "1", pageSize: "50", period });
      if (status) params.set("status", status);
      return apiGet<ChargeList>(`/api/v1/billing/kiorex/charges?${params.toString()}`);
    },
  });

  const disputeMut = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/billing/kiorex/charges/${id}/dispute`, {}),
    onSuccess: () => {
      toast.success(t("admin.billing.kiorex.disputeOpened", "Dispute submitted"));
      void qc.invalidateQueries({ queryKey: ["billing", "kiorex-charges"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <AdminKiorexFreeProgressCard period={period} />
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.kiorex.title", "Kiorex commission charges")}</CardTitle>
        <CardDescription>{t("admin.billing.kiorex.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="grid gap-1">
            <Label htmlFor="kiorex-period">{t("admin.billing.kiorex.period", "Period (YYYY-MM)")}</Label>
            <Input
              id="kiorex-period"
              className="w-36"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-01"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="kiorex-status">{t("admin.billing.kiorex.filterStatus", "Status")}</Label>
            <select
              id="kiorex-status"
              className={nativeSelectClassName}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">{t("admin.billing.kiorex.allStatuses", "All statuses")}</option>
              {["PENDING", "CONFIRMED", "DISPUTED", "REVERSED", "BILLED", "WAIVED"].map((s) => (
                <option key={s} value={s}>
                  {t(`admin.billing.kiorex.status_${s}`, s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {listQuery.isError ? (
          <p className="text-sm text-destructive">{t("admin.billing.kiorex.loadError", "Could not load charges.")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.billing.kiorex.colDate", "Date")}</TableHead>
                <TableHead>{t("admin.billing.kiorex.colDoctor", "Doctor")}</TableHead>
                <TableHead>{t("admin.billing.kiorex.colPatient", "Patient")}</TableHead>
                <TableHead>{t("admin.billing.kiorex.colAmount", "Amount")}</TableHead>
                <TableHead>{t("admin.billing.kiorex.colStatus", "Status")}</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("admin.billing.kiorex.empty", "No Kiorex charges in this period.")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {new Date(r.attendedAt).toLocaleString(i18n.language.startsWith("ar") ? "ar-EG" : "en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>{r.clinicianName}</TableCell>
                    <TableCell>{r.patientInitials}</TableCell>
                    <TableCell>
                      {r.amount} {r.currency}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {t(`admin.billing.kiorex.status_${r.status}`, r.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.canDispute ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disputeMut.isPending}
                          onClick={() => disputeMut.mutate(r.id)}
                        >
                          {t("admin.billing.kiorex.dispute", "Dispute")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
    </div>
  );
}