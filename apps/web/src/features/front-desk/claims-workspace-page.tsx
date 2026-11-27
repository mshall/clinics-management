import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEntitlement } from "@/hooks/use-entitlement";
import { apiErrorMessage } from "@/lib/api-error-message";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { canUsePatientMoney } from "@/lib/patient-money-policy";
import { useAuthStore } from "@/stores/auth-store";
import { useSyncOnChange } from "@/lib/use-sync-on-change";

type Payer = { id: string; nameEn: string; nameAr: string; contractRef: string | null };
type BatchListItem = {
  id: string;
  status: string;
  periodFrom: string;
  periodTo: string;
  currency: string;
  b2bInvoiceNumber: string | null;
  payerCompany: { id: string; nameEn: string; nameAr: string };
  _count: { lines: number };
};
type ClaimLine = {
  id: string;
  externalRef: string;
  amountClaimed: string | number;
  amountCopay: string | number;
  amountPaid: string | number | null;
  status: string;
  rejectionReason: string | null;
};
type BatchDetail = BatchListItem & {
  lines: ClaimLine[];
  remittances: { id: string; reference: string; matchedCount: number; unmatchedCount: number }[];
};

/** MN-05 — claims workspace: batches, submit, remittance import. */
export function ClaimsWorkspacePage() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const user = useAuthStore((s) => s.user);
  const entitled = useEntitlement("mod_invoices");
  const allowed = entitled && canUsePatientMoney(user);
  const qc = useQueryClient();
  const [payerId, setPayerId] = useState("");
  const [periodFrom, setPeriodFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01");
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [remitRef, setRemitRef] = useState("");
  const [remitJson, setRemitJson] = useState("[]");
  const [newPayerName, setNewPayerName] = useState("");

  const payers = useQuery({
    queryKey: ["claims", "payers"],
    queryFn: () => apiGet<Payer[]>("/api/v1/claims/payers"),
    enabled: allowed,
    retry: false,
  });
  const activePayer = payerId || payers.data?.[0]?.id || "";

  const batches = useQuery({
    queryKey: ["claims", "batches", activePayer],
    queryFn: () => {
      const q = activePayer ? `?payerCompanyId=${encodeURIComponent(activePayer)}` : "";
      return apiGet<BatchListItem[]>(`/api/v1/claims/batches${q}`);
    },
    enabled: allowed,
    retry: false,
  });

  const detail = useQuery({
    queryKey: ["claims", "batch", selectedBatchId],
    queryFn: () => apiGet<BatchDetail>(`/api/v1/claims/batches/${selectedBatchId}`),
    enabled: allowed && Boolean(selectedBatchId),
    retry: false,
  });

  useSyncOnChange([detail.data], () => {
    if (!detail.data?.lines?.length) return;
    const hint = JSON.stringify(
      detail.data.lines
        .filter((l) => l.status === "SUBMITTED" || l.status === "ACCEPTED")
        .map((l) => ({ externalRef: l.externalRef, amount: Number(l.amountClaimed) })),
      null,
      2,
    );
    setRemitJson(hint);
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["claims"] });
  };

  const createPayer = useMutation({
    mutationFn: () => apiPost<Payer>("/api/v1/claims/payers", { nameEn: newPayerName }),
    onSuccess: (p) => {
      toast.success(t("claims.payerCreated"));
      setNewPayerName("");
      setPayerId(p.id);
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const createBatch = useMutation({
    mutationFn: () =>
      apiPost<BatchDetail>("/api/v1/claims/batches", {
        payerCompanyId: activePayer,
        periodFrom,
        periodTo,
      }),
    onSuccess: (b) => {
      toast.success(t("claims.batchCreated"));
      setSelectedBatchId(b.id);
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const submitBatch = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/claims/batches/${id}/submit`, {}),
    onSuccess: () => {
      toast.success(t("claims.batchSubmitted"));
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rejectLine = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiPost(`/api/v1/claims/lines/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success(t("claims.lineRejected"));
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const resubmitLine = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/claims/lines/${id}/resubmit`, {}),
    onSuccess: () => {
      toast.success(t("claims.lineResubmitted"));
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const importRemittance = useMutation({
    mutationFn: () => {
      let lines: { externalRef: string; amount: number }[];
      try {
        lines = JSON.parse(remitJson) as { externalRef: string; amount: number }[];
      } catch {
        throw new Error(t("claims.remitJsonInvalid"));
      }
      return apiPost<{ matchedRatio: number }>("/api/v1/claims/remittances", {
        payerCompanyId: activePayer,
        batchId: selectedBatchId ?? undefined,
        reference: remitRef,
        lines,
      });
    },
    onSuccess: (r) => {
      toast.success(t("claims.remittanceImported", { pct: Math.round((r.matchedRatio ?? 0) * 100) }));
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const payerLabel = (p: Payer) => (i18n.language.startsWith("ar") && p.nameAr ? p.nameAr : p.nameEn);
  const money = (n: number, currency: string) => formatMoneyAmount(n, currency, locale);

  if (!allowed) {
    return <p className="p-6 text-sm text-muted-foreground">{t("claims.denied")}</p>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6" data-testid="claims-workspace">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("claims.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("claims.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("claims.payers")}</CardTitle>
          <CardDescription>{t("claims.payersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Label htmlFor="claims-payer">{t("claims.payer")}</Label>
            <select
              id="claims-payer"
              className={nativeSelectClassName}
              value={activePayer}
              onChange={(e) => setPayerId(e.target.value)}
              data-testid="claims-payer-select"
            >
              {(payers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {payerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-40 flex-1">
            <Label htmlFor="new-payer">{t("claims.newPayer")}</Label>
            <Input
              id="new-payer"
              value={newPayerName}
              onChange={(e) => setNewPayerName(e.target.value)}
              placeholder={t("claims.newPayerPlaceholder")}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!newPayerName.trim() || createPayer.isPending}
            onClick={() => createPayer.mutate()}
          >
            {t("claims.addPayer")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("claims.newBatch")}</CardTitle>
          <CardDescription>{t("claims.newBatchHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="period-from">{t("claims.periodFrom")}</Label>
            <Input id="period-from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="period-to">{t("claims.periodTo")}</Label>
            <Input id="period-to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={!activePayer || createBatch.isPending}
            onClick={() => createBatch.mutate()}
            data-testid="claims-create-batch"
          >
            {t("claims.createBatch")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("claims.batches")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">{t("claims.payer")}</th>
                  <th className="p-2 text-start">{t("claims.period")}</th>
                  <th className="p-2 text-start">{t("claims.lines")}</th>
                  <th className="p-2 text-start">{t("claims.status")}</th>
                  <th className="p-2"><span className="sr-only">{t("common.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {(batches.data ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2">
                      {i18n.language.startsWith("ar") && b.payerCompany.nameAr
                        ? b.payerCompany.nameAr
                        : b.payerCompany.nameEn}
                    </td>
                    <td className="p-2 ltr-nums">
                      {b.periodFrom.slice(0, 10)} → {b.periodTo.slice(0, 10)}
                    </td>
                    <td className="p-2 ltr-nums">{b._count.lines}</td>
                    <td className="p-2">
                      <Badge variant="secondary">{b.status}</Badge>
                    </td>
                    <td className="space-x-2 space-x-reverse p-2 text-end">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedBatchId(b.id)}>
                        {t("claims.open")}
                      </Button>
                      {(b.status === "DRAFT" || b.status === "REJECTED") && (
                        <Button type="button" size="sm" onClick={() => submitBatch.mutate(b.id)}>
                          {t("claims.submit")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      {detail.data ? (
        <Card data-testid="claims-batch-detail">
          <CardHeader>
            <CardTitle>
              {t("claims.batchDetail")}{" "}
              {detail.data.b2bInvoiceNumber ? (
                <span className="text-sm font-normal text-muted-foreground">· {detail.data.b2bInvoiceNumber}</span>
              ) : null}
            </CardTitle>
            <CardDescription>
              <Badge>{detail.data.status}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ResponsiveTable>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-start">{t("claims.externalRef")}</th>
                    <th className="p-2 text-start">{t("claims.claimed")}</th>
                    <th className="p-2 text-start">{t("claims.copay")}</th>
                    <th className="p-2 text-start">{t("claims.status")}</th>
                    <th className="p-2"><span className="sr-only">{t("common.actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2 ltr-nums">{l.externalRef}</td>
                      <td className="p-2 ltr-nums">{money(Number(l.amountClaimed), detail.data!.currency)}</td>
                      <td className="p-2 ltr-nums">{money(Number(l.amountCopay), detail.data!.currency)}</td>
                      <td className="p-2">
                        <Badge variant="secondary">{l.status}</Badge>
                        {l.rejectionReason ? (
                          <span className="ms-2 text-xs text-muted-foreground">{l.rejectionReason}</span>
                        ) : null}
                      </td>
                      <td className="space-x-2 space-x-reverse p-2 text-end">
                        {l.status !== "REJECTED" && l.status !== "PAID" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = window.prompt(t("claims.rejectReasonPrompt"));
                              if (reason) rejectLine.mutate({ id: l.id, reason });
                            }}
                          >
                            {t("claims.reject")}
                          </Button>
                        ) : null}
                        {l.status === "REJECTED" ? (
                          <Button type="button" size="sm" onClick={() => resubmitLine.mutate(l.id)}>
                            {t("claims.resubmit")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>

            <div className="space-y-2 border-t pt-4">
              <h3 className="font-medium">{t("claims.importRemittance")}</h3>
              <p className="text-xs text-muted-foreground">{t("claims.importRemittanceHint")}</p>
              <div className="flex flex-wrap gap-3">
                <div className="min-w-40 flex-1">
                  <Label htmlFor="remit-ref">{t("claims.remittanceRef")}</Label>
                  <Input id="remit-ref" value={remitRef} onChange={(e) => setRemitRef(e.target.value)} />
                </div>
              </div>
              <Label htmlFor="remit-json">{t("claims.remittanceLines")}</Label>
              <textarea
                id="remit-json"
                className="min-h-32 w-full rounded-md border bg-background p-2 font-mono text-xs"
                value={remitJson}
                onChange={(e) => setRemitJson(e.target.value)}
                data-testid="claims-remit-json"
              />
              <Button
                type="button"
                disabled={!remitRef.trim() || importRemittance.isPending}
                onClick={() => importRemittance.mutate()}
                data-testid="claims-import-remittance"
              >
                {t("claims.import")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
