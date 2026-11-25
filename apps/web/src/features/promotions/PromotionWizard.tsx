import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormField, Stepper } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/http";
import { usePromotionActions } from "./promotions-api";
import { buildBody, CARE_TYPES, emptyForm, guardTerms, validateForm, type FormError, type PromotionForm } from "./promotions-logic";

const sel = "flex h-11 w-full rounded-lg border border-input bg-card px-3 text-base md:h-10 sm:text-sm";

/** Three steps: the offer (names and patient text), who and when, the budget. Creates a DRAFT (or a new version of an existing promotion); sending for review is a separate, explicit action. */
export function PromotionWizard({ editingId, initial, onDone, onCancel }: { editingId?: string; initial?: PromotionForm; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation(); const actions = usePromotionActions();
  const [step, setStep] = useState(0); const [f, setF] = useState<PromotionForm>(initial ?? emptyForm()); const [errors, setErrors] = useState<FormError[]>([]); const [serverError, setServerError] = useState<string | null>(null); const [terms, setTerms] = useState<string[]>([]);
  const set = <K extends keyof PromotionForm>(k: K, v: PromotionForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (e: FormError) => (errors.includes(e) ? t(`promotions.errors.${e}`) : undefined);
  const stepErrors = (s: number): FormError[] => validateForm(f).filter((e) => (s === 0 ? ["names", "copy"] : s === 1 ? ["careType", "window", "limit"] : ["discount", "percentMax", "budget", "budgetBelowDiscount"]).includes(e));
  const next = () => { const e = stepErrors(step); setErrors(e); if (!e.length) setStep(step + 1); };
  const save = async () => {
    const all = validateForm(f); setErrors(all); setServerError(null); setTerms([]); if (all.length) { setStep(all.some((e) => e === "names" || e === "copy") ? 0 : all.some((e) => e === "careType" || e === "window" || e === "limit") ? 1 : 2); return; }
    try { if (editingId) await actions.newVersion.mutateAsync({ id: editingId, body: buildBody(f) }); else await actions.create.mutateAsync(buildBody(f)); onDone(); }
    catch (e) { const body = e instanceof ApiError ? (e as unknown as { body?: unknown }).body : null; setTerms(guardTerms(body)); setServerError(t("promotions.sendError")); }
  };
  const busy = actions.create.isPending || actions.newVersion.isPending;
  return (
    <Card data-testid="promotion-wizard" className="mb-28 md:mb-0">
      <CardHeader><CardTitle className="text-base">{editingId ? t("promotions.edit") : t("promotions.create")}</CardTitle><CardDescription>{editingId ? t("promotions.editNote") : t("promotions.walletNote")}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Stepper steps={[t("promotions.step1"), t("promotions.step2"), t("promotions.step3")]} current={step} />
        {step === 0 ? (
          <div className="space-y-3">
            <FormField label={t("promotions.nameEn")} required error={err("names")}>{(p) => <Input {...p} dir="ltr" maxLength={80} value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} />}</FormField>
            <FormField label={t("promotions.nameAr")} required>{(p) => <Input {...p} dir="rtl" maxLength={80} value={f.nameAr} onChange={(e) => set("nameAr", e.target.value)} />}</FormField>
            <FormField label={t("promotions.copyEn")} required hint={t("promotions.copyHint")} error={err("copy")}>{(p) => <Input {...p} dir="ltr" maxLength={300} value={f.patientCopyEn} onChange={(e) => set("patientCopyEn", e.target.value)} />}</FormField>
            <FormField label={t("promotions.copyAr")} required>{(p) => <Input {...p} dir="rtl" maxLength={300} value={f.patientCopyAr} onChange={(e) => set("patientCopyAr", e.target.value)} />}</FormField>
          </div>
        ) : step === 1 ? (
          <div className="space-y-3">
            <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("promotions.careTypes")}</legend>
              {CARE_TYPES.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={f.careTypes.includes(c)} onChange={(e) => set("careTypes", e.target.checked ? [...f.careTypes, c] : f.careTypes.filter((x) => x !== c))} />{t(`promotions.careType.${c}`)}</label>)}
              {err("careType") ? <p role="alert" className="text-xs text-[hsl(var(--danger-text))]">{err("careType")}</p> : null}
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={f.newPatientsOnly} onChange={(e) => set("newPatientsOnly", e.target.checked)} />{t("promotions.newPatientsOnly")}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={f.firstBookingOnly} onChange={(e) => set("firstBookingOnly", e.target.checked)} />{t("promotions.firstBookingOnly")}</label>
            <FormField label={t("promotions.minLeadHours")}>{(p) => <Input {...p} inputMode="numeric" value={f.minLeadHours} onChange={(e) => set("minLeadHours", e.target.value)} />}</FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t("promotions.startsAt")} required error={err("window")}>{(p) => <Input {...p} type="datetime-local" dir="ltr" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}</FormField>
              <FormField label={t("promotions.endsAt")} required>{(p) => <Input {...p} type="datetime-local" dir="ltr" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</FormField>
              <FormField label={t("promotions.perPatientLimit")} error={err("limit")}>{(p) => <Input {...p} inputMode="numeric" value={f.perPatientLimit} onChange={(e) => set("perPatientLimit", e.target.value)} />}</FormField>
              <FormField label={t("promotions.perDayLimit")}>{(p) => <Input {...p} inputMode="numeric" value={f.perDayLimit} onChange={(e) => set("perDayLimit", e.target.value)} />}</FormField>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <FormField label={t("promotions.discountKind")}>{(p) => <select {...p} className={sel} value={f.discountKind} onChange={(e) => set("discountKind", e.target.value as PromotionForm["discountKind"])}><option value="FIXED_MINOR">{t("promotions.kindFixed")}</option><option value="PERCENT_BP">{t("promotions.kindPercent")}</option></select>}</FormField>
            <FormField label={t("promotions.discountValue")} hint={t("promotions.discountValueHint")} required error={err("discount")}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={f.discountValue} onChange={(e) => set("discountValue", e.target.value)} />}</FormField>
            <FormField label={t("promotions.maxPerBooking")} error={err("percentMax")}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={f.maxPerBooking} onChange={(e) => set("maxPerBooking", e.target.value)} />}</FormField>
            <FormField label={t("promotions.budgetLabel")} hint={t("promotions.budgetHint")} required error={err("budget") ?? err("budgetBelowDiscount")}>{(p) => <Input {...p} inputMode="decimal" dir="ltr" value={f.budget} onChange={(e) => set("budget", e.target.value)} />}</FormField>
            <FormField label={t("promotions.fundingLabel")} hint={t("promotions.fundingHint")}>{(p) => <select {...p} className={sel} value={f.fundingMode} onChange={(e) => set("fundingMode", e.target.value as PromotionForm["fundingMode"])}><option value="WALLET_ONLY">{t("promotions.funding.WALLET_ONLY")}</option><option value="WALLET_THEN_INVOICE">{t("promotions.funding.WALLET_THEN_INVOICE")}</option></select>}</FormField>
            <p className="text-xs text-muted-foreground">{t("promotions.highValueNote")}</p>
          </div>
        )}
        {serverError ? <div role="alert" className="rounded-lg border border-[hsl(var(--danger-text))] p-3 text-sm" data-testid="promotion-error">{terms.length ? <><strong>{t("promotions.guardTitle")}</strong><p>{t("promotions.guardBody", { terms: terms.join("، ") })}</p></> : serverError}</div> : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" onClick={step === 0 ? onCancel : () => setStep(step - 1)}>{step === 0 ? t("promotions.cancel") : t("promotions.back")}</Button>
          {step < 2 ? <Button type="button" onClick={next}>{t("promotions.next")}</Button> : <Button type="button" disabled={busy} onClick={() => void save()} data-testid="promotion-save">{editingId ? t("promotions.edit") : t("promotions.create")}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
