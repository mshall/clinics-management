import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEntitlement } from "@/hooks/use-entitlement";
import { apiErrorMessage } from "@/lib/api-error-message";
import { useClinicsQuery } from "@/lib/api-hooks";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiFetchBlob, apiGet, apiPost } from "@/lib/http";
import { formatClinicNameFields, localeForLanguage } from "@/lib/locale-display";
import { formatMoneyAmount } from "@/lib/money-display";
import { canApprovePatientMoney, canUsePatientMoney } from "@/lib/patient-money-policy";
import { useAuthStore } from "@/stores/auth-store";

type OpenShift = { id: string; clinicId: string; zNumber: number; currency: string; openingFloat: number; openedAt: string };
type ClosedShift = OpenShift & {
  closedAt: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  cashVariance: number | null;
  cardVariance: number | null;
  expectedCard: number | null;
  countedCard: number | null;
  varianceNote: string | null;
  needsReview: boolean;
  reviewedAt: string | null;
  reviewNote: string | null;
};
type Current = { open: OpenShift | null; lastClosed: ClosedShift | null };

async function openZReport(id: string, format: "a4" | "thermal") {
  const { blob } = await apiFetchBlob(`/api/v1/billing/shifts/${id}/z-report?format=${format}`);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** MN-03 — open the drawer with a float, blind count at close, Z-report, variance review. */
export function CashDrawerPage() {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const user = useAuthStore((s) => s.user);
  const entitled = useEntitlement("mod_invoices");
  const allowed = entitled && canUsePatientMoney(user);
  const isManager = canApprovePatientMoney(user);
  const qc = useQueryClient();
  const { data: clinics = [] } = useClinicsQuery();
  const [clinicId, setClinicId] = useState("");
  const activeClinic = clinicId || clinics[0]?.id || "";
  const [float, setFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [note, setNote] = useState("");
  const [needNote, setNeedNote] = useState(false);
  const [result, setResult] = useState<ClosedShift | null>(null);

  const current = useQuery({
    queryKey: ["cash-drawer", "current", activeClinic],
    queryFn: () => apiGet<Current>(`/api/v1/billing/shifts/current?clinicId=${encodeURIComponent(activeClinic)}`),
    enabled: allowed && Boolean(activeClinic),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["cash-drawer", "history", activeClinic],
    queryFn: () => apiGet<ClosedShift[]>(`/api/v1/billing/shifts?clinicId=${encodeURIComponent(activeClinic)}&limit=20`),
    enabled: allowed && Boolean(activeClinic),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["cash-drawer"] });
  const money = (n: number | null | undefined, currency: string) => formatMoneyAmount(n ?? 0, currency, locale);

  const open = useMutation({
    mutationFn: () => apiPost<OpenShift>("/api/v1/billing/shifts/open", { clinicId: activeClinic, openingFloat: Number(float || 0) }),
    onSuccess: () => {
      setFloat("");
      setResult(null);
      toast.success(t("cashDrawer.opened", "Shift opened"));
      void refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  const close = useMutation({
    mutationFn: (id: string) =>
      apiPost<ClosedShift>(`/api/v1/billing/shifts/${id}/close`, {
        countedCash: Number(countedCash || 0),
        countedCard: Number(countedCard || 0),
        note: note.trim() || undefined,
      }),
    onSuccess: (closed) => {
      setResult(closed);
      setCountedCash("");
      setCountedCard("");
      setNote("");
      setNeedNote(false);
      void refresh();
    },
    onError: (e) => {
      const code = (e as { body?: { code?: string } }).body?.code;
      if (code === "VARIANCE_NOTE_REQUIRED") {
        setNeedNote(true);
        toast.error(t("cashDrawer.noteRequired", "The count does not match the drawer — add a note to close."));
        return;
      }
      toast.error(apiErrorMessage(e, t));
    },
  });

  if (!allowed) {
    return <p className="text-sm text-muted-foreground">{t("cashDrawer.notAllowed", "Your role cannot handle the cash drawer.")}</p>;
  }
  const shift = current.data?.open ?? null;

  return (
    <div className="space-y-6" data-testid="cash-drawer-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("cashDrawer.title", "Cash drawer")}</h1>
          <p className="text-muted-foreground">{t("cashDrawer.subtitle", "Open the shift with a float, count the drawer at close, print the Z-report.")}</p>
        </div>
        <select className={nativeSelectClassName} value={activeClinic} onChange={(e) => setClinicId(e.target.value)} aria-label={t("cashDrawer.clinic", "Clinic")}>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {formatClinicNameFields(c.nameEn, c.nameAr, i18n.language, c.id)}
            </option>
          ))}
        </select>
      </div>

      {result ? <CloseResult shift={result} money={money} /> : null}

      {shift ? (
        <Card data-testid="shift-open">
          <CardHeader>
            <CardTitle>{t("cashDrawer.openShift", "Shift Z#{{z}} is open", { z: shift.zNumber })}</CardTitle>
            <CardDescription className="ltr-nums">
              {t("cashDrawer.openedAt", "Opened {{when}} with a float of {{float}}", {
                when: new Date(shift.openedAt).toLocaleString(locale),
                float: money(shift.openingFloat, shift.currency),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("cashDrawer.blindHint", "Count the cash in the drawer (including the float) and the card slips. The expected amount is shown only after you close.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="counted-cash">{t("cashDrawer.countedCash", "Counted cash")}</Label>
                <Input id="counted-cash" data-testid="counted-cash" type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="counted-card">{t("cashDrawer.countedCard", "Card slips total")}</Label>
                <Input id="counted-card" data-testid="counted-card" type="number" min="0" step="0.01" value={countedCard} onChange={(e) => setCountedCard(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="variance-note">
                {needNote ? t("cashDrawer.noteRequiredLabel", "Why does the count differ? (required)") : t("cashDrawer.note", "Note (optional)")}
              </Label>
              <Textarea id="variance-note" data-testid="variance-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <Button onClick={() => close.mutate(shift.id)} disabled={close.isPending || countedCash === ""} data-testid="close-shift">
              {t("cashDrawer.close", "Close shift")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="shift-closed">
          <CardHeader>
            <CardTitle>{t("cashDrawer.noShift", "No shift is open")}</CardTitle>
            <CardDescription>{t("cashDrawer.openHint", "Count the starting cash (float) and open the drawer.")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="opening-float">{t("cashDrawer.float", "Opening float")}</Label>
              <Input id="opening-float" data-testid="opening-float" type="number" min="0" step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} className="w-40" />
            </div>
            <Button onClick={() => open.mutate()} disabled={open.isPending || !activeClinic} data-testid="open-shift">
              {t("cashDrawer.open", "Open shift")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("cashDrawer.history", "Closed shifts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-start">Z#</th>
                  <th className="px-3 py-2 text-start">{t("cashDrawer.closedAt", "Closed")}</th>
                  <th className="px-3 py-2 text-start">{t("cashDrawer.expectedCash", "Expected cash")}</th>
                  <th className="px-3 py-2 text-start">{t("cashDrawer.countedCash", "Counted cash")}</th>
                  <th className="px-3 py-2 text-start">{t("cashDrawer.variance", "Variance")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(history.data ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border" data-testid="shift-row" data-review={String(s.needsReview && !s.reviewedAt)}>
                    <td className="px-3 py-2 ltr-nums">{s.zNumber}</td>
                    <td className="px-3 py-2 ltr-nums text-muted-foreground">{s.closedAt ? new Date(s.closedAt).toLocaleString(locale) : "—"}</td>
                    <td className="px-3 py-2 ltr-nums">{money(s.expectedCash, s.currency)}</td>
                    <td className="px-3 py-2 ltr-nums">{money(s.countedCash, s.currency)}</td>
                    <td className="px-3 py-2">
                      <span className="ltr-nums">{money(s.cashVariance, s.currency)}</span>{" "}
                      {s.needsReview ? (
                        <Badge variant={s.reviewedAt ? "secondary" : "default"}>
                          {s.reviewedAt ? t("cashDrawer.reviewed", "Reviewed") : t("cashDrawer.needsReview", "Needs review")}
                        </Badge>
                      ) : null}
                      {s.varianceNote ? <span className="block text-xs text-muted-foreground">{s.varianceNote}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <ZReportButtons id={s.id} />
                        {isManager && s.needsReview && !s.reviewedAt ? <ReviewButton id={s.id} onDone={refresh} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!history.isPending && !(history.data ?? []).length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      {t("cashDrawer.noHistory", "No closed shifts yet.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>
    </div>
  );
}

function CloseResult({ shift, money }: { shift: ClosedShift; money: (n: number | null | undefined, c: string) => string }) {
  const { t } = useTranslation();
  const variance = shift.cashVariance ?? 0;
  return (
    <Card data-testid="shift-result" data-review={String(shift.needsReview)} className={shift.needsReview ? "border-destructive" : undefined}>
      <CardHeader>
        <CardTitle>{t("cashDrawer.closedTitle", "Shift Z#{{z}} closed", { z: shift.zNumber })}</CardTitle>
        <CardDescription>
          {shift.needsReview
            ? t("cashDrawer.flagged", "The variance is above the limit — the owner has been asked to review it.")
            : Math.abs(variance) >= 0.01
              ? t("cashDrawer.smallVariance", "Small variance recorded with your note.")
              : t("cashDrawer.balanced", "The drawer balances.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground">{t("cashDrawer.expectedCash", "Expected cash")}</p>
          <p className="font-medium ltr-nums">{money(shift.expectedCash, shift.currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("cashDrawer.countedCash", "Counted cash")}</p>
          <p className="font-medium ltr-nums">{money(shift.countedCash, shift.currency)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t("cashDrawer.variance", "Variance")}</p>
          <p className="font-medium ltr-nums" data-testid="shift-variance">
            {money(variance, shift.currency)}
          </p>
        </div>
        <div className="sm:col-span-3">
          <ZReportButtons id={shift.id} />
        </div>
      </CardContent>
    </Card>
  );
}

function ZReportButtons({ id }: { id: string }) {
  const { t } = useTranslation();
  const print = (format: "a4" | "thermal") => void openZReport(id, format).catch((e) => toast.error(apiErrorMessage(e, t)));
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="outline" onClick={() => print("thermal")}>
        <Printer className="me-1 h-4 w-4" />
        {t("cashDrawer.printThermal", "Receipt printer")}
      </Button>
      <Button size="sm" variant="outline" onClick={() => print("a4")}>
        {t("cashDrawer.printA4", "A4")}
      </Button>
    </span>
  );
}

function ReviewButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: (note: string) => apiPost(`/api/v1/billing/shifts/${id}/review`, { note }),
    onSuccess: onDone,
    onError: (e) => toast.error(apiErrorMessage(e, t)),
  });
  return (
    <Button
      size="sm"
      data-testid="review-shift"
      disabled={m.isPending}
      onClick={() => {
        const note = window.prompt(t("cashDrawer.reviewPrompt", "What did you find? (required)"))?.trim();
        if (note) m.mutate(note);
      }}
    >
      {t("cashDrawer.review", "Mark reviewed")}
    </Button>
  );
}
