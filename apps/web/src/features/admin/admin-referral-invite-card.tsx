import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/http";

type ReferralHub = {
  enabled?: boolean;
  code: string | null;
  link: string | null;
  stats: { invited: number; rewarded: number; pending: number };
};

export function AdminReferralInviteCard() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  const hubQuery = useQuery({
    queryKey: ["growth", "referral"],
    queryFn: () => apiGet<ReferralHub>("/api/v1/growth/referral"),
  });

  const data = hubQuery.data;

  useEffect(() => {
    if (!data?.link || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, data.link, { width: 160, margin: 1 });
  }, [data?.link]);

  const shareWhatsApp = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const text = t("admin.billing.referral.whatsAppShare", {
        defaultValue: "Join Kiorly with my referral link: {{link}}",
        link: data.link ?? "",
      });
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
  });

  async function copyLink() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      toast.success(t("admin.billing.referral.copied", "Link copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("common.copyFailed", "Could not copy"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.billing.referral.title", "Invite a colleague")}</CardTitle>
        <CardDescription>{t("admin.billing.referral.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hubQuery.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : data && !data.code ? (
          <p className="text-sm text-muted-foreground">
            {t("admin.billing.referral.off", "Referral codes are currently switched off for your organization.")}
          </p>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-start gap-6">
              <canvas ref={canvasRef} className="rounded border border-border bg-white p-2" aria-hidden />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm">
                  {t("admin.billing.referral.code", "Your code")}: <span className="font-mono font-semibold">{data.code}</span>
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={data.link ?? ""} className="font-mono text-xs" />
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
                    {copied ? t("common.copied", "Copied") : t("common.copy", "Copy")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.billing.referral.stats", "{{rewarded}} rewarded · {{pending}} pending", {
                    rewarded: data.stats.rewarded,
                    pending: data.stats.pending,
                  })}
                </p>
                <Button type="button" size="sm" disabled={shareWhatsApp.isPending} onClick={() => shareWhatsApp.mutate()}>
                  {t("admin.billing.referral.shareWhatsApp", "Share on WhatsApp")}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">{t("admin.billing.referral.loadError")}</p>
        )}
      </CardContent>
    </Card>
  );
}