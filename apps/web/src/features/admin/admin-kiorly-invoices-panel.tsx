import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/api-url";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";
import { AdminKiorlyPayDialog } from "./admin-kiorly-pay-dialog";

type KiorlyInvoiceRow = {
  id: string;
  number: string;
  status: string;
  total: string;
  amountDue: string;
  currency: string;
  dueAt: string | null;
  periodKey: string;
  paymentUnderReview?: boolean;
};

type KiorlyInvoiceDetail = KiorlyInvoiceRow & {
  settlementSummary: {
    explanationEn: string;
    explanationAr: string;
    kiorexPatientCount: number;
    higherOf: string;
  } | null;
  lines: { type: string; descEn: string; amount: string }[];
};

type KiorlyInvoiceList = {
  items: KiorlyInvoiceRow[];
  total: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "muted"> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PAID: "default",
  PARTIALLY_PAID: "muted",
  VOID: "outline",
  UNCOLLECTIBLE: "muted",
};

export function AdminKiorlyInvoicesPanel({ canManagePay = false }: { canManagePay?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<KiorlyInvoiceRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["billing", "invoices", detailId],
    enabled: Boolean(detailId),
    queryFn: () => apiGet<KiorlyInvoiceDetail>(`/api/v1/billing/invoices/${detailId}`),
  });

  const listQuery = useQuery({
    queryKey: ["billing", "invoices"],
    queryFn: () => apiGet<KiorlyInvoiceList>("/api/v1/billing/invoices?page=1&pageSize=50"),
  });

  async function openPdf(id: string) {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(apiUrl(`/api/v1/billing/invoices/${id}?format=pdf`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      toast.error(t("admin.billing.invoices.pdfError", "Could not open PDF"));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const rows = listQuery.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.invoices.title", "Kiorly invoices")}</CardTitle>
        <CardDescription>{t("admin.billing.invoices.hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {listQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : listQuery.isError ? (
          <p className="text-sm text-destructive">{t("admin.billing.invoices.loadError")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.billing.invoices.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.billing.invoices.number")}</TableHead>
                <TableHead>{t("admin.billing.invoices.period")}</TableHead>
                <TableHead>{t("admin.billing.invoices.status")}</TableHead>
                <TableHead className="text-end">{t("admin.billing.invoices.total")}</TableHead>
                <TableHead className="text-end">{t("admin.billing.invoices.due")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const canPay =
                  row.status === "ISSUED" || row.status === "PARTIALLY_PAID";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.number}</TableCell>
                    <TableCell className="text-xs">{row.periodKey}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
                          {t(`admin.billing.invoices.status_${row.status}`, row.status)}
                        </Badge>
                        {row.paymentUnderReview ? (
                          <Badge variant="outline">{t("admin.billing.invoices.underReview", "Under review")}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-end text-xs">
                      {row.total} {row.currency}
                    </TableCell>
                    <TableCell className="text-end text-xs text-muted-foreground">
                      {row.dueAt
                        ? new Date(row.dueAt).toLocaleDateString(i18n.language)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDetailId(row.id)}>
                          {t("admin.billing.invoices.detail", "Details")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void openPdf(row.id)}
                        >
                          {t("admin.billing.invoices.pdf", "PDF")}
                        </Button>
                        {canPay && canManagePay ? (
                          <Button type="button" size="sm" onClick={() => setPayTarget(row)}>
                            {t("admin.billing.invoices.pay", "Pay")}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.billing.invoices.detailTitle", "Invoice details")}</DialogTitle>
          </DialogHeader>
          {detailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : detailQuery.data?.settlementSummary ? (
            <p className="text-sm leading-relaxed">
              {i18n.language.startsWith("ar")
                ? detailQuery.data.settlementSummary.explanationAr
                : detailQuery.data.settlementSummary.explanationEn}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin.billing.invoices.noSettlementSummary", "No settlement summary on this invoice.")}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {payTarget ? (
        <AdminKiorlyPayDialog
          open={Boolean(payTarget)}
          onOpenChange={(open) => {
            if (!open) setPayTarget(null);
          }}
          invoiceId={payTarget.id}
          invoiceNumber={payTarget.number}
          amountDue={payTarget.amountDue}
          currency={payTarget.currency}
          paymentUnderReview={payTarget.paymentUnderReview}
          onPaymentStarted={() => void qc.invalidateQueries({ queryKey: ["billing", "invoices"] })}
        />
      ) : null}
    </Card>
  );
}