import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Download, FileText, Printer, Share2, UserSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { downloadQr, downloadVcard, fetchPosterHtml, qrBlobUrl, type GrowthLink } from "./growth-api";

type Kind = "POSTER" | "DESK" | "DOCTOR_CARD";

/** QR preview, SVG and PNG download, printable sheets (poster A4/A5, reception desk card, doctor cards), vCard and WhatsApp share for ONE link. */
export function QrPosterDialog({ link, open, onOpenChange }: { link: GrowthLink | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const [lang, setLang] = useState<"ar" | "en">(isAr ? "ar" : "en");
  const [size, setSize] = useState<"A4" | "A5">("A4");
  const [kind, setKind] = useState<Kind>("POSTER");
  const [src, setSrc] = useState<{ id: string; url: string } | { id: string; error: true } | null>(null);

  const id = link?.id;
  useEffect(() => {
    if (!open || !id) return;
    let alive = true;
    let created: string | null = null;
    qrBlobUrl(id, "svg")
      .then((url) => {
        created = url;
        if (alive) setSrc({ id, url });
      })
      .catch(() => alive && setSrc({ id, error: true }));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [open, id]);

  if (!link) return null;
  const current = src && src.id === link.id ? src : null;
  const name = link.label.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "link";
  const isDoctor = link.ownerScope === "DOCTOR";
  const kinds: Kind[] = isDoctor ? ["POSTER", "DOCTOR_CARD"] : link.ownerScope === "DESK" ? ["DESK", "POSTER"] : ["POSTER", "DESK"];
  const active: Kind = kinds.includes(kind) ? kind : kinds[0]!;
  const disabled = link.status === "REVOKED";

  async function print() {
    try {
      const html = await fetchPosterHtml(link!.id, { lang, size, kind: active });
      const w = window.open("", "_blank");
      if (!w) {
        toast.error(t("growth.qr.popup"));
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("growth.qr.failed"));
    }
  }
  const run = (p: Promise<unknown>) => p.catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("growth.qr.failed")));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="qr-dialog">
        <DialogHeader>
          <DialogTitle>{t("growth.qr.title")}</DialogTitle>
          <DialogDescription>{link.label}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-56 place-items-center rounded-xl border bg-white p-2" aria-busy={!current}>
            {current && "url" in current ? (
              <img src={current.url} alt={t("growth.qr.alt", { label: link.label })} className="size-full" data-testid="qr-image" />
            ) : current && "error" in current ? (
              <p role="alert" className="px-4 text-center text-sm text-destructive">{t("growth.qr.failed")}</p>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">{t("growth.qr.loading")}</p>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("growth.qr.scanHint")}</p>
          <p dir="ltr" className="break-all text-center font-mono text-xs" data-testid="qr-short-url">{link.shortUrl}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void run(downloadQr(link.id, "svg", name))} data-testid="qr-download-svg"><Download className="size-4" aria-hidden />{t("growth.qr.svg")}</Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void run(downloadQr(link.id, "png", name))} data-testid="qr-download-png"><Download className="size-4" aria-hidden />{t("growth.qr.png")}</Button>
            {isDoctor ? <Button type="button" variant="outline" size="sm" onClick={() => void run(downloadVcard(link.id, name))} data-testid="qr-vcard"><UserSquare className="size-4" aria-hidden />{t("growth.qr.vcard")}</Button> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(link.shortUrl).then(() => toast.success(t("growth.links.copied"))).catch(() => toast.error(t("growth.links.copyFailed")))}><Copy className="size-4" aria-hidden />{t("growth.links.copy")}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(t("growth.qr.shareText", { link: link.shortUrl }))}`, "_blank", "noopener,noreferrer")}><Share2 className="size-4" aria-hidden />{t("growth.qr.share")}</Button>
          </div>
        </div>
        <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3" disabled={disabled}>
          <legend className="px-1 text-sm font-medium"><FileText className="me-1 inline size-4" aria-hidden />{t("growth.qr.poster")}</legend>
          <div className="space-y-1">
            <Label htmlFor="poster-kind">{t("growth.qr.kind")}</Label>
            <select id="poster-kind" className="native-select h-10 w-full" value={active} onChange={(e) => setKind(e.target.value as Kind)} data-testid="poster-kind">
              {kinds.map((k) => <option key={k} value={k}>{t(`growth.qr.kinds.${k}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="poster-lang">{t("growth.qr.language")}</Label>
            <select id="poster-lang" className="native-select h-10 w-full" value={lang} onChange={(e) => setLang(e.target.value as "ar" | "en")} data-testid="poster-lang">
              <option value="ar">{t("growth.qr.arabic")}</option>
              <option value="en">{t("growth.qr.english")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="poster-size">{t("growth.qr.size")}</Label>
            <select id="poster-size" className="native-select h-10 w-full" value={size} onChange={(e) => setSize(e.target.value as "A4" | "A5")} disabled={active === "DOCTOR_CARD"} data-testid="poster-size">
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <Button type="button" onClick={() => void print()} data-testid="poster-print"><Printer className="size-4" aria-hidden />{t("growth.qr.poster")}</Button>
            <p className="mt-2 text-xs text-muted-foreground">{t("growth.qr.pdfHint")}</p>
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
