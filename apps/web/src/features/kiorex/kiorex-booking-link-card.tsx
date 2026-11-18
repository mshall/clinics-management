import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Copy, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/http";
import i18n from "@/lib/i18n";
import type { KiorexBookingLinkDto } from "./kiorex-types";

type PosterSize = "A4" | "A5";
type PosterLang = "en" | "ar";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function printPoster(link: KiorexBookingLinkDto, size: PosterSize, lang: PosterLang) {
  const tl = i18n.getFixedT(lang);
  const qr = await QRCode.toDataURL(link.url, { width: size === "A4" ? 640 : 440, margin: 1 });
  const name = lang === "ar" ? link.clinicNameAr || link.clinicNameEn : link.clinicNameEn;
  const html = `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>${escapeHtml(name)}</title>
<style>
@page { size: ${size}; margin: 16mm; }
body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; text-align: center; color: #111; }
h1 { font-size: ${size === "A4" ? 34 : 26}px; margin: 0 0 8px; }
p.cta { font-size: ${size === "A4" ? 24 : 18}px; margin: 0 0 24px; }
img { width: ${size === "A4" ? 120 : 85}mm; height: auto; }
p.url { font-family: ui-monospace, monospace; font-size: ${size === "A4" ? 16 : 13}px; direction: ltr; margin-top: 16px; }
p.note { font-size: 13px; color: #555; }
</style></head><body>
<h1>${escapeHtml(name)}</h1>
<p class="cta">${escapeHtml(tl("kiorexTab.bookingLink.posterCta", "Scan to book your visit online"))}</p>
<img src="${qr}" alt="">
<p class="url">${escapeHtml(link.url)}</p>
<p class="note">${escapeHtml(tl("kiorexTab.bookingLink.posterNote", "Free to book · Powered by Kiorex"))}</p>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;
  const w = window.open("", "_blank", "noopener=no");
  if (!w) {
    toast.error(i18n.t("kiorexTab.bookingLink.popupBlocked", "Allow pop-ups to print the poster"));
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success(t("kiorexTab.bookingLink.copied", "Link copied")))
          .catch(() => toast.error(t("common.copyFailed", "Could not copy")));
      }}
    >
      <Copy className="size-4" />
      <span className="sr-only sm:not-sr-only sm:ms-1">{t("common.copy", "Copy")}</span>
    </Button>
  );
}

export function KiorexBookingLinkCard({ clinicId }: { clinicId: string }) {
  const { t, i18n: inst } = useTranslation();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [posterSize, setPosterSize] = useState<PosterSize>("A4");
  const [posterLang, setPosterLang] = useState<PosterLang>(inst.language.startsWith("ar") ? "ar" : "en");
  const isAr = inst.language.startsWith("ar");

  const q = useQuery({
    queryKey: ["kiorex", "booking-link", clinicId],
    queryFn: () => apiGet<KiorexBookingLinkDto>(`/api/v1/kiorex/booking-link?clinicId=${encodeURIComponent(clinicId)}`),
    enabled: Boolean(clinicId),
  });
  const data = q.data;

  useEffect(() => {
    if (data) setSlugDraft(data.slug);
  }, [data]);

  useEffect(() => {
    if (!data?.url || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, data.url, { width: 160, margin: 1 });
  }, [data?.url]);

  const save = useMutation({
    mutationFn: () => apiPut<KiorexBookingLinkDto>("/api/v1/kiorex/booking-link", { clinicId, slug: slugDraft.trim() }),
    onSuccess: (next) => {
      qc.setQueryData(["kiorex", "booking-link", clinicId], next);
      toast.success(t("kiorexTab.bookingLink.saved", "Booking link updated"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function shareWhatsApp(url: string) {
    const text = t("kiorexTab.bookingLink.shareText", { defaultValue: "Book your visit with us online: {{link}}", link: url });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function shareNative(url: string) {
    if (typeof navigator.share === "function") {
      await navigator.share({ url, title: data ? (isAr ? data.clinicNameAr : data.clinicNameEn) : undefined }).catch(() => undefined);
    } else {
      shareWhatsApp(url);
    }
  }

  return (
    <Card data-testid="kiorex-booking-link-card">
      <CardHeader>
        <CardTitle className="text-base">{t("kiorexTab.bookingLink.title", "Your booking link")}</CardTitle>
        <CardDescription>
          {t(
            "kiorexTab.bookingLink.hint",
            "Share it on WhatsApp, Instagram and Google Maps. Bookings from your own link are always commission-free.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {q.isPending ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
        {q.isError ? (
          <p className="text-sm text-destructive">{t("kiorexTab.bookingLink.loadError", "Could not load your booking link.")}</p>
        ) : null}
        {data ? (
          <>
            <div className="flex flex-wrap items-start gap-6">
              <canvas ref={canvasRef} className="rounded border border-border bg-white p-2" aria-hidden />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex gap-2">
                  <Input readOnly value={data.url} dir="ltr" className="font-mono text-xs" data-testid="kiorex-booking-link-url" />
                  <CopyButton value={data.url} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => shareWhatsApp(data.url)}>
                    {t("kiorexTab.bookingLink.whatsApp", "Share on WhatsApp")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void shareNative(data.url)}>
                    <Share2 className="size-4" />
                    <span className="ms-1">{t("kiorexTab.bookingLink.share", "Share")}</span>
                  </Button>
                </div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="kiorex-booking-link-free">
                  {t("kiorexTab.bookingLink.commissionFree", "No Kiorex commission on bookings made through this link.")}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="kiorex-booking-slug">{t("kiorexTab.bookingLink.slug", "Link name")}</Label>
              <div className="flex gap-2">
                <Input
                  id="kiorex-booking-slug"
                  dir="ltr"
                  value={slugDraft}
                  onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
                  className="max-w-xs font-mono text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={save.isPending || !slugDraft.trim() || slugDraft.trim() === data.slug}
                  onClick={() => save.mutate()}
                >
                  {t("common.save", "Save")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("kiorexTab.bookingLink.slugHint", "3–40 lowercase letters, digits or hyphens.")}
              </p>
            </div>

            {data.doctors.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("kiorexTab.bookingLink.doctorLinks", "Doctor links")}</p>
                <ul className="space-y-2">
                  {data.doctors.map((d) => (
                    <li key={d.listingId} className="flex flex-wrap items-center gap-2 text-sm" data-testid="kiorex-doctor-link">
                      <span className="min-w-32 font-medium">{isAr ? d.nameAr : d.nameEn}</span>
                      <code dir="ltr" className="truncate text-xs text-muted-foreground">
                        {d.url}
                      </code>
                      <CopyButton value={d.url} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="kiorex-poster-size">{t("kiorexTab.bookingLink.posterSize", "Poster size")}</Label>
                <select
                  id="kiorex-poster-size"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={posterSize}
                  onChange={(e) => setPosterSize(e.target.value as PosterSize)}
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="kiorex-poster-lang">{t("kiorexTab.bookingLink.posterLanguage", "Poster language")}</Label>
                <select
                  id="kiorex-poster-lang"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={posterLang}
                  onChange={(e) => setPosterLang(e.target.value as PosterLang)}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void printPoster(data, posterSize, posterLang)}>
                <Printer className="size-4" />
                <span className="ms-1">{t("kiorexTab.bookingLink.printPoster", "Print QR poster")}</span>
              </Button>
            </div>

            <details className="rounded-md border p-3 text-sm" data-testid="kiorex-google-guide">
              <summary className="cursor-pointer font-medium">
                {t("kiorexTab.bookingLink.googleTitle", "Add a “Book” button on Google")}
              </summary>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-muted-foreground">
                <li>{t("kiorexTab.bookingLink.googleStep1", "Open your Google Business Profile (search your clinic name on Google while signed in).")}</li>
                <li>{t("kiorexTab.bookingLink.googleStep2", "Choose “Edit profile” → “Business information” → “Bookings” (or “Appointment links”).")}</li>
                <li>{t("kiorexTab.bookingLink.googleStep3", "Paste your booking link above and save.")}</li>
                <li>{t("kiorexTab.bookingLink.googleStep4", "Google may take a few days to show the button. Bookings from it stay commission-free.")}</li>
              </ol>
            </details>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
