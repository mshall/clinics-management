import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, PiggyBank, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api-error-message";
import { apiGet, apiPost } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";

export type PaymentMethodKey = "CASH" | "CARD" | "TRANSFER" | "WALLET" | "OTHER";
const METHODS: PaymentMethodKey[] = ["CASH", "CARD", "TRANSFER", "WALLET"];

type Refundable = {
  kind: "PAYMENT" | "REVENUE";
  id: string;
  label: string;
  amount: number;
  remaining: number;
  currency: string;
  at: string;
};

type PackageRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  totalSessions: number;
  sessionsRemaining: number;
  paidAmount: number;
  unusedValue: number;
  currency: string;
  expiresOn: string | null;
  expired: boolean;
  status: string;
};

type DepositRow = { id: string; amount: number; currency: string; status: string; source: string; createdAt: string };
type RefundRow = { id: string; amount: number; currency: string; status: string; reason: string; createdAt: string };

export type PatientBalances = {
  depositsHeld: number;
  packagesUnusedValue: number;
  deposits: DepositRow[];
  packages: PackageRow[];
  refunds: RefundRow[];
  refundable: Refundable[];
  canApproveRefunds: boolean;
};

const patientBalancesKey = (patientId: string) => ["patient-balances", patientId] as const;

function MethodChips({ value, onChange }: { value: PaymentMethodKey; onChange: (m: PaymentMethodKey) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {METHODS.map((m) => (
        <Button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          variant={value === m ? "default" : "outline"}
          className="min-h-11"
          onClick={() => onChange(m)}
        >
          {t(`patientMoney.method.${m}`)}
        </Button>
      ))}
    </div>
  );
}

export function RefundDialog({
  open,
  onOpenChange,
  patientId,
  source,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  source: Refundable | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethodKey>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      apiPost<{ status: string }>("/api/v1/billing/refunds", {
        ...(source?.kind === "PAYMENT" ? { paymentId: source.id } : { revenueEntryId: source?.id }),
        amount: Number(amount),
        reason,
        method,
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: patientBalancesKey(patientId) });
      if (r.status === "PENDING_APPROVAL") setPendingNote(true);
      else onOpenChange(false);
    },
    onError: (e) => setError(apiErrorMessage(e, t)),
  });

  const amt = Number(amount);
  const valid = source && amt > 0 && amt <= source.remaining && reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setAmount("");
          setReason("");
          setError(null);
          setPendingNote(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("patientMoney.refundTitle")}</DialogTitle>
        </DialogHeader>
        {source ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (valid) submit.mutate();
            }}
          >
            <p className="text-sm text-muted-foreground">
              {source.label} ·{" "}
              {t("patientMoney.refundableLeft", {
                amount: formatMoneyAmount(source.remaining, source.currency, locale),
              })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">{t("patientMoney.amount")}</Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ltr-nums"
                aria-invalid={amount !== "" && !(amt > 0 && amt <= source.remaining)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("patientMoney.refundMethod")}</Label>
              <MethodChips value={method} onChange={setMethod} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">{t("patientMoney.reason")}</Label>
              <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{t("patientMoney.refundExplainer")}</p>
            {pendingNote ? (
              <p role="status" className="rounded-md bg-[hsl(var(--warning)/0.12)] p-2 text-sm text-[hsl(var(--warning))] ">
                {t("patientMoney.refundPendingApproval")}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="submit" disabled={!valid || submit.isPending || pendingNote}>
                {t("patientMoney.confirmRefund")}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SellPackageDialog({
  open,
  onOpenChange,
  patientId,
  clinicId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  clinicId: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [sessions, setSessions] = useState("5");
  const [price, setPrice] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [method, setMethod] = useState<PaymentMethodKey>("CASH");
  const [error, setError] = useState<string | null>(null);
  const sell = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/billing/packages", {
        clinicId,
        patientId,
        nameEn,
        nameAr,
        totalSessions: Number(sessions),
        paidAmount: Number(price),
        method,
        expiresOn: expiresOn || null,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: patientBalancesKey(patientId) });
      onOpenChange(false);
    },
    onError: (e) => setError(apiErrorMessage(e, t)),
  });
  const valid = nameEn.trim() && Number(sessions) >= 1 && Number(price) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("patientMoney.sellPackage")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) sell.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name-en">{t("patientMoney.packageNameEn")}</Label>
              <Input id="pkg-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name-ar">{t("patientMoney.packageNameAr")}</Label>
              <Input id="pkg-name-ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-sessions">{t("patientMoney.sessions")}</Label>
              <Input id="pkg-sessions" inputMode="numeric" className="ltr-nums" value={sessions} onChange={(e) => setSessions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">{t("patientMoney.price")}</Label>
              <Input id="pkg-price" inputMode="decimal" className="ltr-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pkg-expires">{t("patientMoney.expiresOn")}</Label>
              <Input id="pkg-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <MethodChips value={method} onChange={setMethod} />
          <p className="text-xs text-muted-foreground">{t("patientMoney.packageExplainer")}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={!valid || sell.isPending}>
              {t("patientMoney.sellPackage")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PatientMoneySection({ patientId, clinicId }: { patientId: string; clinicId?: string | null }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const qc = useQueryClient();
  const isAr = i18n.language.startsWith("ar");
  const [refundSource, setRefundSource] = useState<Refundable | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: patientBalancesKey(patientId),
    queryFn: () => apiGet<PatientBalances>(`/api/v1/patients/${patientId}/balances`),
  });
  const consume = useMutation({
    mutationFn: (pkgId: string) => apiPost(`/api/v1/billing/packages/${pkgId}/consume`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientBalancesKey(patientId) }),
    onError: (e) => setActionError(apiErrorMessage(e, t)),
  });
  const applyDeposit = useMutation({
    mutationFn: (depositId: string) => apiPost(`/api/v1/billing/deposits/${depositId}/apply`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientBalancesKey(patientId) }),
    onError: (e) => setActionError(apiErrorMessage(e, t)),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      apiPost(`/api/v1/billing/refunds/${id}/${decision}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientBalancesKey(patientId) }),
    onError: (e) => setActionError(apiErrorMessage(e, t)),
  });

  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>;
  if (isError) return <p className="text-sm text-destructive">{apiErrorMessage(error, t)}</p>;
  const currency = data.packages[0]?.currency ?? data.deposits[0]?.currency ?? data.refundable[0]?.currency ?? "EGP";
  const fmt = (n: number, c = currency) => formatMoneyAmount(n, c, locale);

  return (
    <div className="space-y-4" data-testid="patient-money-section">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PiggyBank className="h-5 w-5 text-[hsl(var(--success))]" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">{t("patientMoney.depositsHeld")}</p>
              <p className="text-lg font-semibold ltr-nums" data-testid="deposits-held">{fmt(data.depositsHeld)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Package className="h-5 w-5 text-kx-ocean-700" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">{t("patientMoney.packagesUnused")}</p>
              <p className="text-lg font-semibold ltr-nums">{fmt(data.packagesUnusedValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("patientMoney.packages")}</CardTitle>
          {clinicId ? (
            <Button size="sm" onClick={() => setSellOpen(true)}>
              {t("patientMoney.sellPackage")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.packages.length === 0 ? <p className="text-muted-foreground">{t("patientMoney.noPackages")}</p> : null}
          {data.packages.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="font-medium">{isAr && p.nameAr ? p.nameAr : p.nameEn}</p>
                <p className="text-xs text-muted-foreground ltr-nums">
                  {t("patientMoney.sessionsLeft", { left: p.sessionsRemaining, total: p.totalSessions })} ·{" "}
                  {fmt(p.paidAmount, p.currency)}
                  {p.expiresOn ? ` · ${t("patientMoney.expires", { date: new Date(p.expiresOn).toLocaleDateString(locale) })}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.expired ? <Badge variant="secondary">{t("patientMoney.expired")}</Badge> : null}
                {p.status !== "ACTIVE" ? <Badge variant="outline">{t(`patientMoney.packageStatus.${p.status}`)}</Badge> : null}
                {p.status === "ACTIVE" && !p.expired ? (
                  <Button size="sm" variant="outline" disabled={consume.isPending} onClick={() => consume.mutate(p.id)}>
                    {t("patientMoney.useSession")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("patientMoney.deposits")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.deposits.length === 0 ? <p className="text-muted-foreground">{t("patientMoney.noDeposits")}</p> : null}
          {data.deposits.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span className="ltr-nums">{fmt(d.amount, d.currency)}</span>
              <div className="flex items-center gap-2">
                <Badge variant={d.status === "HELD" ? "default" : "outline"}>{t(`patientMoney.depositStatus.${d.status}`)}</Badge>
                {d.status === "HELD" ? (
                  <Button size="sm" variant="outline" disabled={applyDeposit.isPending} onClick={() => applyDeposit.mutate(d.id)}>
                    {t("patientMoney.applyDeposit")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("patientMoney.refunds")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.refundable.length === 0 ? <p className="text-muted-foreground">{t("patientMoney.nothingRefundable")}</p> : null}
          {data.refundable.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div>
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground ltr-nums">
                  {new Date(r.at).toLocaleDateString(locale)} · {fmt(r.amount, r.currency)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRefundSource(r)} data-testid="open-refund">
                {t("patientMoney.refund")}
              </Button>
            </div>
          ))}
          {data.refunds.length ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground">{t("patientMoney.refundHistory")}</p>
              {data.refunds.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="ltr-nums">{fmt(r.amount, r.currency)}</span> · {r.reason}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === "COMPLETED" ? "secondary" : "outline"}>{t(`patientMoney.refundStatus.${r.status}`)}</Badge>
                    {r.status === "PENDING_APPROVAL" && data.canApproveRefunds ? (
                      <>
                        <Button size="sm" onClick={() => decide.mutate({ id: r.id, decision: "approve" })}>
                          {t("patientMoney.approve")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, decision: "reject" })}>
                          {t("patientMoney.reject")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RefundDialog
        open={refundSource != null}
        onOpenChange={(v) => !v && setRefundSource(null)}
        patientId={patientId}
        source={refundSource}
      />
      {clinicId ? <SellPackageDialog open={sellOpen} onOpenChange={setSellOpen} patientId={patientId} clinicId={clinicId} /> : null}
    </div>
  );
}
