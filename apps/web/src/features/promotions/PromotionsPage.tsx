import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Percent } from "lucide-react";
import { EmptyState, StatusChip } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { PromotionBudgetCard } from "./PromotionBudgetCard";
import { PromotionLedgerTable } from "./PromotionLedgerTable";
import { PromotionWizard } from "./PromotionWizard";
import { usePromotionActions, usePromotions } from "./promotions-api";
import { canArchive, canEdit, canPause, canResume, canSubmit, emptyForm, minorToUnits, statusTone, type PromotionForm, type PromotionView } from "./promotions-logic";

const toLocalInput = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const formOf = (p: PromotionView): PromotionForm => { const v = p.version; return { ...emptyForm(), nameAr: v.nameAr, nameEn: v.nameEn, patientCopyAr: v.patientCopyAr, patientCopyEn: v.patientCopyEn, careTypes: v.scope.careTypes, discountKind: v.discountKind, discountValue: String(v.discountKind === "FIXED_MINOR" ? v.discountValue / 100 : v.discountValue / 100), maxPerBooking: v.maxPerBookingMinor ? String(v.maxPerBookingMinor / 100) : "", budget: String(v.budgetCapMinor / 100), perPatientLimit: String(v.perPatientLimit), perDayLimit: v.perDayLimit ? String(v.perDayLimit) : "", startsAt: toLocalInput(v.startsAt), endsAt: toLocalInput(v.endsAt), fundingMode: v.fundingMode }; };

/** Sponsored patient discounts (GRW-P2-S): the owner's list with budget, burn, reservations and the ledger. The clinic funds the discount from its own credit; patients see "sponsored by the clinic". */
export function PromotionsPage() {
  const { t, i18n } = useTranslation(); const locale = localeForLanguage(i18n.language); const q = usePromotions(); const a = usePromotionActions();
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "new" } | { kind: "edit"; p: PromotionView }>({ kind: "list" }); const [open, setOpen] = useState<string | null>(null);
  const money = (minor: number) => formatMoneyAmount(minorToUnits(minor), "EGP", locale); const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("promotions.loading")}</p>;
  if (q.isError) return <EmptyState tone="error" compact title={t("promotions.loadError")} action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>{t("promotions.retry")}</Button>} />;
  if (mode.kind !== "list") return <PromotionWizard editingId={mode.kind === "edit" ? mode.p.id : undefined} initial={mode.kind === "edit" ? formOf(mode.p) : undefined} onDone={() => setMode({ kind: "list" })} onCancel={() => setMode({ kind: "list" })} />;
  const list = (q.data ?? []).filter((p) => p.status !== "ARCHIVED");
  return (
    <div className="space-y-4 pb-28 md:pb-0" data-testid="promotions-page">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Percent className="size-4" aria-hidden />{t("promotions.title")}</CardTitle><CardDescription>{t("promotions.intro")}</CardDescription></div>
          <div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to="/credit">{t("promotions.creditLink")}</Link></Button><Button size="sm" onClick={() => setMode({ kind: "new" })} data-testid="promotion-new">{t("promotions.create")}</Button></div></CardHeader>
      </Card>
      {list.length === 0 ? <EmptyState compact title={t("promotions.empty")} /> : list.map((p) => {
        const v = p.version; const title = i18n.language.startsWith("ar") ? v.nameAr : v.nameEn;
        return (
          <Card key={p.id} data-testid={`promotion-${p.id}`}>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{title}</CardTitle><StatusChip tone={statusTone(p.status)}>{t(`promotions.status.${p.status}`)}</StatusChip></div>
              <CardDescription>{v.discountKind === "FIXED_MINOR" ? t("promotions.discountFixed", { amount: money(v.discountValue) }) : t("promotions.discountPercent", { pct: v.discountValue / 100, max: money(v.maxPerBookingMinor ?? 0) })} · {t("promotions.window", { from: date(v.startsAt), to: date(v.endsAt) })} · {t("promotions.perPatient", { count: v.perPatientLimit })} · {t(`promotions.funding.${v.fundingMode}`)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PromotionBudgetCard p={p} />
              <section aria-label={t("promotions.reviews")} className="flex flex-wrap gap-2 text-xs">{p.reviews.map((r) => <StatusChip key={r.kind} tone={r.decision === "APPROVED" ? "good" : r.decision === "REJECTED" ? "bad" : r.decision ? "warn" : "neutral"} dot={false}>{t(`promotions.reviewKind.${r.kind}`)}: {r.decision === "APPROVED" ? t("promotions.reviewApproved") : r.decision === "REJECTED" ? t("promotions.reviewRejected") : r.decision ? t("promotions.reviewNeedsChanges") : t("promotions.reviewPending")}</StatusChip>)}</section>
              <div className="flex flex-wrap gap-2">
                {canSubmit(p.status) ? <Button size="sm" disabled={a.submit.isPending} onClick={() => a.submit.mutate(p.id)} data-testid={`promotion-submit-${p.id}`}>{t("promotions.submit")}</Button> : null}
                {canPause(p.status) ? <Button size="sm" variant="outline" onClick={() => a.pause.mutate({ id: p.id })}>{t("promotions.pause")}</Button> : null}
                {canResume(p.status) ? <Button size="sm" variant="outline" onClick={() => a.resume.mutate(p.id)}>{t("promotions.resume")}</Button> : null}
                {canEdit(p.status) ? <Button size="sm" variant="outline" onClick={() => setMode({ kind: "edit", p })}>{t("promotions.edit")}</Button> : null}
                {canArchive(p.status) ? <Button size="sm" variant="ghost" onClick={() => a.archive.mutate(p.id)}>{t("promotions.archive")}</Button> : null}
                <Button size="sm" variant="ghost" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>{t("promotions.ledger")}</Button>
              </div>
              {a.submit.isError && a.submit.variables === p.id ? <p role="alert" className="text-sm" data-testid="promotion-submit-error">{t("promotions.guardBody", { terms: ((a.submit.error as unknown as { body?: { hits?: Array<{ term?: string }> } }).body?.hits ?? []).map((h) => h.term).filter(Boolean).join("، ") })}</p> : null}
              {open === p.id ? <PromotionLedgerTable id={p.id} /> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
