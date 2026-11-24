import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Pause, Play, QrCode, Trash2 } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/http";
import { useCreateLink, useGrowthLinks, useUpdateLink, type GrowthAccess, type GrowthLink, type ProfilePreview } from "./growth-api";
import { LINK_CHANNELS, LINK_SCOPES, createLinkError, type LinkScope } from "./growth-logic";
import { QrPosterDialog } from "./qr-poster";

const num = (n: number, lang: string) => n.toLocaleString(lang.startsWith("ar") ? "ar-EG" : "en");
const msg = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);

function CreateLink({ clinicId, branches, profile, access }: { clinicId: string; branches: Array<{ id: string; nameEn: string; nameAr: string }>; profile?: ProfilePreview; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const create = useCreateLink();
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<LinkScope>("CLINIC");
  const [channel, setChannel] = useState("QR_POSTER");
  const [branchRef, setBranchRef] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [deskLabel, setDeskLabel] = useState("");
  const [campaign, setCampaign] = useState("");
  const missing = createLinkError({ label, scope, branchRef, clinicianId, deskLabel, campaign });
  const full = access.plan.linksUsed >= access.plan.maxActiveLinks;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing || full) return;
    create.mutate(
      {
        clinicId,
        ownerScope: scope,
        channelKind: channel,
        label: label.trim(),
        ...(scope === "DOCTOR" ? { clinicianId } : {}),
        ...(scope === "BRANCH" ? { branchRef } : {}),
        ...(scope === "DESK" ? { deskLabel: deskLabel.trim() } : {}),
        ...(campaign.trim() ? { tags: { utm_campaign: campaign.trim().toLowerCase() } } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t("growth.links.created"));
          setLabel("");
          setDeskLabel("");
          setCampaign("");
        },
        onError: (err) => toast.error(msg(err, t("growth.loadError"))),
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="link-create-form" aria-label={t("growth.links.create")}>
      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="gl-label">{t("growth.links.name")}</Label>
        <Input id="gl-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={t("growth.links.namePlaceholder")} data-testid="link-label" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="gl-scope">{t("growth.links.scope")}</Label>
        <select id="gl-scope" className="native-select h-10 w-full" value={scope} onChange={(e) => setScope(e.target.value as LinkScope)} data-testid="link-scope">
          {LINK_SCOPES.map((s) => <option key={s} value={s}>{t(`growth.links.scopes.${s}`)}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="gl-channel">{t("growth.links.channel")}</Label>
        <select id="gl-channel" className="native-select h-10 w-full" value={channel} onChange={(e) => setChannel(e.target.value)} data-testid="link-channel">
          {LINK_CHANNELS.map((c) => <option key={c} value={c}>{t(`growth.links.channels.${c}`)}</option>)}
        </select>
      </div>
      {scope === "BRANCH" ? (
        <div className="space-y-1">
          <Label htmlFor="gl-branch">{t("growth.links.branch")}</Label>
          <select id="gl-branch" className="native-select h-10 w-full" value={branchRef} onChange={(e) => setBranchRef(e.target.value)} data-testid="link-branch">
            <option value="" />
            {branches.map((b) => <option key={b.id} value={b.id}>{isAr ? b.nameAr || b.nameEn : b.nameEn}</option>)}
          </select>
        </div>
      ) : null}
      {scope === "DOCTOR" ? (
        <div className="space-y-1">
          <Label htmlFor="gl-doctor">{t("growth.links.doctor")}</Label>
          <select id="gl-doctor" className="native-select h-10 w-full" value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} data-testid="link-doctor">
            <option value="" />
            {(profile?.doctors ?? []).map((d) => <option key={d.clinicianId} value={d.clinicianId}>{isAr ? d.nameAr : d.nameEn}</option>)}
          </select>
        </div>
      ) : null}
      {scope === "DESK" ? (
        <div className="space-y-1">
          <Label htmlFor="gl-desk">{t("growth.links.desk")}</Label>
          <Input id="gl-desk" value={deskLabel} maxLength={60} onChange={(e) => setDeskLabel(e.target.value)} placeholder={t("growth.links.deskPlaceholder")} data-testid="link-desk" />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="gl-campaign">{t("growth.links.campaign")}</Label>
        <Input id="gl-campaign" dir="ltr" value={campaign} maxLength={40} onChange={(e) => setCampaign(e.target.value)} aria-describedby="gl-campaign-hint" data-testid="link-campaign" />
        <p id="gl-campaign-hint" className="text-xs text-muted-foreground">{t("growth.links.campaignHint")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit" disabled={Boolean(missing) || full || create.isPending} data-testid="link-create">{t("growth.links.create")}</Button>
        {full ? <p role="alert" className="text-sm text-destructive" data-testid="link-limit">{t("growth.plan.limit")}</p> : null}
        <p className="text-xs text-muted-foreground" data-testid="plan-used">{t("growth.plan.used", { used: num(access.plan.linksUsed, i18n.language), max: num(access.plan.maxActiveLinks, i18n.language) })}</p>
      </div>
    </form>
  );
}

export function LinksSection({ clinicId, branches, profile, access }: { clinicId: string; branches: Array<{ id: string; nameEn: string; nameAr: string }>; profile?: ProfilePreview; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const links = useGrowthLinks();
  const update = useUpdateLink();
  const [qrFor, setQrFor] = useState<GrowthLink | null>(null);
  const [revoking, setRevoking] = useState<GrowthLink | null>(null);
  const items = links.data?.items ?? [];

  const patch = (l: GrowthLink, status: string) =>
    update.mutate({ id: l.id, body: { status } }, { onSuccess: () => toast.success(t("growth.links.updated")), onError: (e) => toast.error(msg(e, t("growth.loadError"))) });

  return (
    <Card data-testid="links-section">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.links.title")}</CardTitle>
        <CardDescription>{t("growth.links.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {access.can.create ? <CreateLink clinicId={clinicId} branches={branches} profile={profile} access={access} /> : null}
        {links.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p> : null}
        {links.isError ? (
          <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button variant="outline" size="sm" onClick={() => void links.refetch()}>{t("growth.retry")}</Button>} />
        ) : null}
        {links.isSuccess && items.length === 0 ? <EmptyState compact title={t("growth.links.empty")} description={t("growth.links.emptyHint")} /> : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border">
            <Table data-testid="links-table">
              <caption className="sr-only">{t("growth.links.title")}. {t("growth.links.last30")}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("growth.links.columns.name")}</TableHead>
                  <TableHead scope="col">{t("growth.links.columns.scope")}</TableHead>
                  <TableHead scope="col">{t("growth.links.columns.channel")}</TableHead>
                  <TableHead scope="col">{t("growth.links.columns.status")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("growth.links.columns.visits")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("growth.links.columns.bookings")}</TableHead>
                  <TableHead scope="col" className="text-end">{t("growth.links.columns.attended")}</TableHead>
                  <TableHead scope="col">{t("growth.links.columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id} data-testid="link-row" data-status={l.status}>
                    <TableCell className="font-medium">
                      {l.label}
                      <span dir="ltr" className="block font-mono text-xs text-muted-foreground">{l.code}</span>
                    </TableCell>
                    <TableCell>{t(`growth.links.scopes.${l.ownerScope}`)}{l.deskLabel ? ` · ${l.deskLabel}` : ""}</TableCell>
                    <TableCell>{t(`growth.links.channels.${l.channelKind}`, l.channelKind)}</TableCell>
                    <TableCell><span className="rounded-full border px-2 py-0.5 text-xs" data-testid="link-status">{t(`growth.links.statuses.${l.status}`)}</span></TableCell>
                    <TableCell className="text-end ltr-nums">{num(l.last30.visits, lang)}</TableCell>
                    <TableCell className="text-end ltr-nums">{num(l.last30.bookings, lang)}</TableCell>
                    <TableCell className="text-end ltr-nums">{num(l.last30.attended, lang)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(l.shortUrl).then(() => toast.success(t("growth.links.copied"))).catch(() => toast.error(t("growth.links.copyFailed")))} aria-label={`${t("growth.links.copy")}: ${l.label}`} data-testid="link-copy"><Copy className="size-4" aria-hidden /></Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setQrFor(l)} aria-label={`${t("growth.links.qr")}: ${l.label}`} data-testid="link-qr"><QrCode className="size-4" aria-hidden /></Button>
                        {access.can.update && l.status === "ACTIVE" ? <Button type="button" size="sm" variant="ghost" onClick={() => patch(l, "PAUSED")} aria-label={`${t("growth.links.pause")}: ${l.label}`} data-testid="link-pause"><Pause className="size-4" aria-hidden /></Button> : null}
                        {access.can.update && l.status === "PAUSED" ? <Button type="button" size="sm" variant="ghost" onClick={() => patch(l, "ACTIVE")} aria-label={`${t("growth.links.resume")}: ${l.label}`} data-testid="link-resume"><Play className="size-4" aria-hidden /></Button> : null}
                        {access.can.revoke && l.status !== "REVOKED" ? <Button type="button" size="sm" variant="ghost" onClick={() => setRevoking(l)} aria-label={`${t("growth.links.revoke")}: ${l.label}`} data-testid="link-revoke"><Trash2 className="size-4 text-destructive" aria-hidden /></Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("growth.links.last30")}</p>
      </CardContent>
      <QrPosterDialog link={qrFor} open={Boolean(qrFor)} onOpenChange={(v) => !v && setQrFor(null)} />
      <Dialog open={Boolean(revoking)} onOpenChange={(v) => !v && setRevoking(null)}>
        <DialogContent data-testid="revoke-dialog">
          <DialogHeader>
            <DialogTitle>{t("growth.links.revokeConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("growth.links.revokeConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>{t("growth.links.cancel")}</Button>
            <Button variant="destructive" data-testid="revoke-confirm" onClick={() => { if (revoking) patch(revoking, "REVOKED"); setRevoking(null); }}>{t("growth.links.revoke")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
