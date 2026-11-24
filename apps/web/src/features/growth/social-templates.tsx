import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Download, MessageCircle, Smartphone } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/http";
import type { GrowthAccess, ProfilePreview } from "./growth-api";
import { useCountShare, useRenderCard, useSocialTemplates, type RenderedCard, type SocialTemplate } from "./provider-marketing-api";
import { errorCodeOf, pngBlobUrl, refusedCategories, smsUrl, whatsappUrl } from "./provider-marketing-logic";

/** GRW-P2-C social content templates: approved wording only; the server renders the card, appends the protected footer and refuses claims. */
export function SocialTemplates({ clinicId, access, profile }: { clinicId: string; access: GrowthAccess; profile?: ProfilePreview }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const templates = useSocialTemplates(clinicId, isAr ? "ar" : "en");
  const render = useRenderCard();
  const count = useCountShare();
  const [picked, setPicked] = useState<SocialTemplate | null>(null);
  const [doctor, setDoctor] = useState("");
  const [custom, setCustom] = useState("");
  const [card, setCard] = useState<RenderedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const canCreate = access.can.create;

  useEffect(() => () => { if (png) URL.revokeObjectURL(png); }, [png]);

  const onRender = async () => {
    if (!picked) return;
    setError(null);
    setCard(null);
    try {
      const r = await render.mutateAsync({ templateId: picked.id, clinicId, clinicianId: picked.needsDoctor ? doctor : undefined, customLine: custom || undefined, png: true });
      setCard(r);
      if (r.pngBase64) setPng(pngBlobUrl(r.pngBase64));
    } catch (e) {
      const code = errorCodeOf(e);
      if (code === "CONTENT_NOT_ALLOWED") {
        const what = refusedCategories((e as ApiError).body).map((c) => t(`growth.pm.share.refusedWhat.${c}`, { defaultValue: c }));
        setError(`${t("growth.pm.share.refused")}${what.length ? ` (${what.join(", ")})` : ""}`);
      } else if (code === "SHARE_LINK_REQUIRED") setError(t("growth.pm.share.noLink"));
      else if (e instanceof ApiError && e.status === 403) setError(code === "FEATURE_DISABLED" || (e.body as { error?: string } | undefined)?.error === "FEATURE_DISABLED" ? t("growth.pm.common.disabled") : t("growth.pm.common.forbidden"));
      else setError(e instanceof Error ? e.message : t("growth.pm.common.error"));
    }
  };
  const counted = (channel: string) => { if (picked) count.mutate({ templateId: picked.id, clinicId, channel }); };
  const copy = async () => {
    if (!card) return;
    try { await navigator.clipboard.writeText(card.caption); toast.success(t("growth.pm.common.copied")); counted("COPY"); } catch { toast.error(t("growth.pm.common.error")); }
  };
  const download = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = `kiorly-card-${picked?.slug ?? "card"}.png`;
    a.click();
    toast.success(t("growth.pm.share.downloaded"));
    counted("DOWNLOAD");
  };

  return (
    <Card data-testid="social-templates">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.pm.share.title")}</CardTitle>
        <CardDescription>{t("growth.pm.share.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.pm.common.loading")}</p> : null}
        {templates.isError ? <EmptyState tone="error" compact title={t("growth.pm.common.error")} action={<Button size="sm" variant="outline" onClick={() => void templates.refetch()}>{t("growth.pm.common.retry")}</Button>} /> : null}
        {templates.isSuccess && templates.data.items.length === 0 ? <EmptyState compact title={t("growth.pm.share.empty")} /> : null}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(templates.data?.items ?? []).map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                className={`min-h-11 w-full rounded-xl border p-3 text-start transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${picked?.id === tpl.id ? "border-[color:var(--kx-product-clinic)] bg-[color:var(--kx-product-clinic)]/5" : "bg-card hover:bg-muted/40"}`}
                onClick={() => { setPicked(tpl); setCard(null); setError(null); }}
                aria-pressed={picked?.id === tpl.id}
                data-testid={`template-${tpl.slug}`}
              >
                <span className="text-xs font-medium text-muted-foreground">{t(`growth.pm.share.kind.${tpl.kind}`)}{tpl.needsDoctor ? ` · ${t("growth.pm.share.needsDoctor")}` : ""}</span>
                <span className="block text-sm font-semibold">{tpl.title}</span>
                <span className="block text-xs text-muted-foreground">{tpl.shares30d ? t("growth.pm.share.used", { count: tpl.shares30d }) : t("growth.pm.share.unused")}</span>
              </button>
            </li>
          ))}
        </ul>

        {picked ? (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="template-editor">
            <div className="space-y-3">
              <p className="rounded-lg bg-muted/40 p-3 text-sm" dir={picked.locale === "ar" ? "rtl" : "ltr"}>{picked.body}</p>
              {picked.needsDoctor ? (
                <div className="space-y-1">
                  <Label htmlFor="share-doctor">{t("growth.pm.common.doctor")}</Label>
                  <select id="share-doctor" className="native-select h-10" value={doctor} onChange={(e) => setDoctor(e.target.value)} data-testid="share-doctor">
                    <option value="">-</option>
                    {(profile?.doctors ?? []).map((d) => <option key={d.clinicianId} value={d.clinicianId}>{isAr ? d.nameAr || d.nameEn : d.nameEn}</option>)}
                  </select>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="share-custom">{t("growth.pm.share.customLine")}</Label>
                <Input id="share-custom" maxLength={140} value={custom} onChange={(e) => setCustom(e.target.value)} data-testid="share-custom" />
                <p className="text-xs text-muted-foreground">{t("growth.pm.share.customHint")}</p>
              </div>
              <p className="text-xs text-muted-foreground"><span className="font-medium">{t("growth.pm.share.footer")}:</span> {picked.protectedFooter}</p>
              <Button onClick={() => void onRender()} disabled={!canCreate || render.isPending || (picked.needsDoctor && !doctor)} data-testid="share-render">
                {render.isPending ? t("growth.pm.share.rendering") : t("growth.pm.share.render")}
              </Button>
              {!canCreate ? <p className="text-xs text-muted-foreground">{t("growth.pm.common.forbidden")}</p> : null}
              {error ? <p role="alert" className="rounded-lg border border-destructive p-3 text-sm" data-testid="share-error">{error}</p> : null}
            </div>
            <div className="space-y-3" aria-live="polite">
              {card ? (
                <div className="space-y-3" data-testid="share-result">
                  <p className="text-xs font-medium text-muted-foreground">{t("growth.pm.share.preview")}</p>
                  {png ? <img src={png} alt={picked.title} className="max-h-96 w-auto rounded-lg border" data-testid="share-image" /> : null}
                  <Label htmlFor="share-caption">{t("growth.pm.share.caption")}</Label>
                  <textarea id="share-caption" readOnly className="min-h-28 w-full rounded-lg border bg-card p-2 text-sm" dir={card.locale === "ar" ? "rtl" : "ltr"} value={card.caption} data-testid="share-caption" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copy()} data-testid="share-copy"><Copy className="size-4" aria-hidden />{t("growth.pm.share.copy")}</Button>
                    <Button asChild size="sm" variant="outline"><a href={whatsappUrl(card.caption)} target="_blank" rel="noreferrer noopener" onClick={() => counted("WHATSAPP")} data-testid="share-whatsapp"><MessageCircle className="size-4" aria-hidden />{t("growth.pm.share.whatsapp")}</a></Button>
                    <Button asChild size="sm" variant="outline"><a href={smsUrl(card.caption)} onClick={() => counted("SMS")} data-testid="share-sms"><Smartphone className="size-4" aria-hidden />{t("growth.pm.share.sms")}</a></Button>
                    <Button size="sm" variant="outline" onClick={download} data-testid="share-download"><Download className="size-4" aria-hidden />{t("growth.pm.share.download")}</Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
