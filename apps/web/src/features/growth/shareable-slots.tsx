import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Download, MessageCircle } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/http";
import type { GrowthAccess, ProfilePreview } from "./growth-api";
import { useShareableSlots, useSlotCard, type SlotCard } from "./provider-marketing-api";
import { errorCodeOf, pngBlobUrl, slotLabelFor, whatsappUrl } from "./provider-marketing-logic";

/** GRW-P2-C shareable slots: the next free times of one doctor as a card. Nothing is held; a taken time is refused again when the card is made. */
export function ShareableSlots({ clinicId, access, profile }: { clinicId: string; access: GrowthAccess; profile?: ProfilePreview }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isAr = lang.startsWith("ar");
  const doctors = profile?.doctors ?? [];
  const [doctor, setDoctor] = useState("");
  const [days, setDays] = useState(3);
  const [chosen, setChosen] = useState<string[]>([]);
  const [card, setCard] = useState<SlotCard | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clinicianId = doctor || doctors[0]?.clinicianId || "";
  const slots = useShareableSlots(clinicId, clinicianId, days);
  const make = useSlotCard();
  useEffect(() => () => { if (png) URL.revokeObjectURL(png); }, [png]);

  const toggle = (iso: string) => setChosen((c) => (c.includes(iso) ? c.filter((x) => x !== iso) : c.length >= 5 ? c : [...c, iso]));
  const onMake = async () => {
    setError(null);
    setGone(false);
    try {
      const r = await make.mutateAsync({ clinicId, clinicianId, startsAt: chosen, locale: isAr ? "ar" : "en", png: true });
      setCard(r);
      if (r.pngBase64) setPng(pngBlobUrl(r.pngBase64));
    } catch (e) {
      setCard(null);
      if (errorCodeOf(e) === "SLOT_NO_LONGER_AVAILABLE") { setGone(true); setChosen([]); void slots.refetch(); }
      else if (errorCodeOf(e) === "SHARE_LINK_REQUIRED") setError(t("growth.pm.share.noLink"));
      else setError(e instanceof ApiError || e instanceof Error ? e.message : t("growth.pm.common.error"));
    }
  };
  const copy = async () => { if (card) { try { await navigator.clipboard.writeText(card.caption); toast.success(t("growth.pm.common.copied")); } catch { toast.error(t("growth.pm.common.error")); } } };
  const download = () => { if (!png) return; const a = document.createElement("a"); a.href = png; a.download = "kiorly-free-times.png"; a.click(); };

  return (
    <Card data-testid="shareable-slots">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.pm.slots.title")}</CardTitle>
        <CardDescription>{t("growth.pm.slots.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="slots-doctor">{t("growth.pm.slots.doctor")}</Label>
            <select id="slots-doctor" className="native-select h-10" value={clinicianId} onChange={(e) => { setDoctor(e.target.value); setChosen([]); setCard(null); }} data-testid="slots-doctor">
              {doctors.map((d) => <option key={d.clinicianId} value={d.clinicianId}>{isAr ? d.nameAr || d.nameEn : d.nameEn}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="slots-days">{t("growth.pm.slots.days")}</Label>
            <select id="slots-days" className="native-select h-10" value={days} onChange={(e) => { setDays(Number(e.target.value)); setChosen([]); }} data-testid="slots-days">
              {[1, 3, 7].map((d) => <option key={d} value={d}>{t("growth.pm.slots.daysN", { count: d })}</option>)}
            </select>
          </div>
        </div>
        {!doctors.length ? <EmptyState compact title={t("growth.profile.noDoctors")} /> : null}
        {slots.isPending && clinicianId ? <p role="status" className="text-sm text-muted-foreground">{t("growth.pm.common.loading")}</p> : null}
        {slots.isError ? <EmptyState tone="error" compact title={t("growth.pm.common.error")} action={<Button size="sm" variant="outline" onClick={() => void slots.refetch()}>{t("growth.pm.common.retry")}</Button>} /> : null}
        {gone ? <p role="alert" className="rounded-lg border border-destructive p-3 text-sm" data-testid="slots-gone">{t("growth.pm.slots.gone")}</p> : null}
        {slots.data ? (
          <>
            {slots.data.items.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="slots-empty">{t("growth.pm.slots.none")}</p> : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("growth.pm.slots.choose")} <span className="text-muted-foreground">({t("growth.pm.slots.chosen", { count: chosen.length })})</span></legend>
                <div className="flex flex-wrap gap-2">
                  {slots.data.items.map((s) => (
                    <label key={s.startsAt} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${chosen.includes(s.startsAt) ? "border-[color:var(--kx-product-clinic)] bg-[color:var(--kx-product-clinic)]/10" : "bg-card"}`}>
                      <input type="checkbox" className="size-4" checked={chosen.includes(s.startsAt)} onChange={() => toggle(s.startsAt)} data-testid="slot-option" />
                      <span className="ltr-nums">{slotLabelFor(s, lang)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <p className="text-xs text-muted-foreground">{t("growth.pm.slots.zone", { zone: slots.data.timezone })}</p>
          </>
        ) : null}
        <Button onClick={() => void onMake()} disabled={!access.can.create || chosen.length === 0 || make.isPending} data-testid="slots-create">{t("growth.pm.slots.create")}</Button>
        {error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p> : null}
        {card ? (
          <div className="space-y-3" data-testid="slots-result" aria-live="polite">
            {png ? <img src={png} alt={t("growth.pm.slots.title")} className="max-h-96 w-auto rounded-lg border" /> : null}
            <p className="text-xs text-muted-foreground">{t("growth.pm.slots.link")}: <span dir="ltr" className="break-all">{card.link}</span></p>
            <textarea readOnly className="min-h-24 w-full rounded-lg border bg-card p-2 text-sm" dir={card.locale === "ar" ? "rtl" : "ltr"} value={card.caption} aria-label={t("growth.pm.share.caption")} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copy()}><Copy className="size-4" aria-hidden />{t("growth.pm.share.copy")}</Button>
              <Button asChild size="sm" variant="outline"><a href={whatsappUrl(card.caption)} target="_blank" rel="noreferrer noopener"><MessageCircle className="size-4" aria-hidden />{t("growth.pm.share.whatsapp")}</a></Button>
              <Button size="sm" variant="outline" onClick={download}><Download className="size-4" aria-hidden />{t("growth.pm.share.download")}</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
