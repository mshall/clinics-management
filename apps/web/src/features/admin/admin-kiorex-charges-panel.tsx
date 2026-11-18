import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { AdminKiorexFreeProgressCard } from "./admin-kiorex-free-progress-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DISPUTE_REASONS = ["EXISTING_PATIENT", "DID_NOT_ATTEND", "DUPLICATE", "OTHER"] as const;

type ChargeRow = {
  id: string;
  attendedAt: string;
  clinicianName: string;
  patientInitials: string;
  amount: string;
  currency: string;
  status: string;
  canDispute: boolean;
  dispute?: {
    id: string;
    reason: string;
    status: string;
    resolution: string | null;
  } | null;
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
  const [disputeRow, setDisputeRow] = useState<ChargeRow | null>(null);
  const [disputeReason, setDisputeReason] = useState<(typeof DISPUTE_REASONS)[number]>("EXISTING_PATIENT");
  const [disputeNote, setDisputeNote] = useState("");

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
    mutationFn: (payload: { id: string; reason: string; note?: string }) =>
      apiPost(`/api/v1/billing/kiorex/charges/${payload.id}/dispute`, {
        reason: payload.reason,
        note: payload.note,
      }),
    onSuccess: () => {
      toast.success(t("admin.billing.kiorex.disputeOpened", "Dispute submitted"));
      setDisputeRow(null);
      setDisputeNote("");
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
                      {r.dispute ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(`admin.billing.kiorex.disputeStatus_${r.dispute.status}`, r.dispute.status)}
                          {r.dispute.resolution ? ` · ${r.dispute.resolution}` : ""}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {r.canDispute ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disputeMut.isPending}
                          onClick={() => {
                            setDisputeRow(r);
                            setDisputeReason("EXISTING_PATIENT");
                            setDisputeNote("");
                          }}
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

      <Dialog open={!!disputeRow} onOpenChange={(open) => !open && setDisputeRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.billing.kiorex.disputeDialogTitle", "Dispute this charge")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t("admin.billing.kiorex.disputeReason", "Reason")}</Label>
              <select
                className={nativeSelectClassName}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value as (typeof DISPUTE_REASONS)[number])}
              >
                {DISPUTE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(`admin.billing.kiorex.disputeReason_${reason}`, reason)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{t("admin.billing.kiorex.disputeNote", "Note (optional)")}</Label>
              <Textarea value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={
                disputeMut.isPending || (disputeReason === "OTHER" && !disputeNote.trim())
              }
              onClick={() =>
                disputeRow &&
                disputeMut.mutate({
                  id: disputeRow.id,
                  reason: disputeReason,
                  note: disputeNote.trim() || undefined,
                })
              }
            >
              {t("admin.billing.kiorex.disputeSubmit", "Submit dispute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}