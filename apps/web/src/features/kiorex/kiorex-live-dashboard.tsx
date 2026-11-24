import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/http";
import { formatMoneyAmount } from "@/lib/money-display";
import { localeForLanguage } from "@/lib/locale-display";
import { KiorexConnectPassportCard } from "./kiorex-connect-passport-card";
import "./kiorex-connect-i18n";
import "./kiorex-door-i18n";
import { fmtNumber } from "./kiorex-door-hooks";
import type { ConnectDto } from "./kiorex-connect-types";
import type { FrontDoorDto } from "./kiorex-door-types";
import type { KiorexOverviewDto } from "./kiorex-types";

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return <div className="rounded-2xl border bg-card p-4" data-testid={testId}><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold ltr-nums">{value}</p>{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

/** State 4: the real dashboard of a connected organisation. Numbers come from the existing overview, ratings and listing data; nothing is estimated. */
export function KiorexLiveDashboard({ clinicId, door, connect }: { clinicId: string; door: FrontDoorDto; connect: ConnectDto | undefined }) {
  const { t, i18n } = useTranslation(); const qc = useQueryClient(); const lang = i18n.language; const locale = localeForLanguage(lang);
  const o = useQuery({ queryKey: ["kiorex", "overview", clinicId, "current"], queryFn: () => apiGet<KiorexOverviewDto>(`/api/v1/kiorex/overview?clinicId=${encodeURIComponent(clinicId)}`), enabled: Boolean(clinicId), retry: false }).data;
  const pause = useMutation({ mutationFn: (v: { id: string; paused: boolean }) => apiPost(`/api/v1/marketplace/listings/${v.id}/pause?paused=${v.paused}`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: ["kiorex", "connect", clinicId] }) });
  const n = (v: number) => fmtNumber(v, lang);
  const kiorexBookings = o ? o.bookingsByChannel.marketplace + o.bookingsByChannel.whatsapp : 0;
  const listings = connect?.doctors ?? [];
  return (
    <section className="space-y-5" aria-labelledby="kx-live-h" data-testid="kiorex-live-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kx-live-h" className="text-xl font-semibold">{t("kiorexDoor.live.title")}</h2>
        <Button asChild variant="outline" size="sm"><Link to="/kiorex/connect" data-testid="live-settings">{t("kiorexDoor.live.settings")}</Link></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile testId="live-bookings" label={`${t("kiorexDoor.live.bookings")} · ${t("kiorexDoor.live.month")}`} value={o ? n(kiorexBookings) : "-"} hint={o ? `${t("kiorexDoor.live.attended")}: ${n(o.attended)} · ${t("kiorexDoor.live.newPatients")}: ${n(o.newPatients)}` : undefined} />
        <Tile testId="live-fees" label={t("kiorexDoor.live.fees")} value={o ? formatMoneyAmount(o.commission.amount, o.currency, locale) : "-"} hint={o ? t("kiorexDoor.live.feesHint", { visits: n(o.commission.chargedVisits) }) : undefined} />
        <div className="rounded-2xl border bg-card p-4" data-testid="live-rating">
          <p className="text-xs text-muted-foreground">{t("kiorexDoor.live.rating")}</p>
          {o?.rating.averageRating != null ? <><p className="flex items-center gap-1 text-2xl font-semibold ltr-nums"><Star className="size-5 text-amber-500" fill="currentColor" aria-hidden="true" />{o.rating.averageRating.toFixed(1)}</p><p className="text-xs text-muted-foreground">{t("kiorexDoor.live.reviews", { count: o.rating.reviewCount })}</p></> : <p className="text-sm text-muted-foreground">{t("kiorexDoor.live.noRating")}</p>}
        </div>
        <Tile testId="live-listing-count" label={t("kiorexDoor.live.listings")} value={connect ? `${n(listings.filter((l) => l.status === "LIVE").length)} / ${n(listings.length)}` : "-"} hint={t("kiorexDoor.live.listingsHint")} />
      </div>
      {listings.length ? (
        <div className="rounded-2xl border bg-card" data-testid="live-listings">
          <ul className="divide-y">
            {listings.map((l) => (
              <li key={l.listingId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-testid={`live-listing-${l.listingId}`} data-status={l.status}>
                <span className="font-medium">{l.name}</span>
                <span className="rounded-full border px-2 text-xs">{t(`kiorexConnect.doctor.listing.${l.status}`)}</span>
                {l.status === "PAUSED" && l.pausedReason === "owner" ? <span className="text-xs text-muted-foreground">{t("kiorexDoor.live.pausedByYou")}</span> : null}
                <span className="ms-auto flex gap-2">
                  {l.status === "LIVE" ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate({ id: l.listingId, paused: true })} data-testid={`live-pause-${l.listingId}`}>{t("kiorexDoor.live.pause")}</Button> : null}
                  {l.status === "PAUSED" && l.pausedReason === "owner" ? <Button size="sm" variant="outline" disabled={pause.isPending} onClick={() => pause.mutate({ id: l.listingId, paused: false })} data-testid={`live-resume-${l.listingId}`}>{t("kiorexDoor.live.resume")}</Button> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-2xl border bg-card p-4" data-testid="live-recent">
        <h3 className="mb-2 font-medium">{t("kiorexDoor.live.recent")}</h3>
        {door.recent.length === 0 ? <p className="text-sm text-muted-foreground">{t("kiorexDoor.live.noRecent")}</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead><tr className="text-start text-xs text-muted-foreground"><th scope="col" className="py-1 text-start font-medium">{t("kiorexDoor.live.when")}</th><th scope="col" className="py-1 text-start font-medium">{t("kiorexDoor.live.doctor")}</th><th scope="col" className="py-1 text-start font-medium">{t("kiorexDoor.live.status")}</th><th scope="col" className="py-1 text-start font-medium">{t("kiorexDoor.live.via")}</th></tr></thead>
            <tbody>{door.recent.map((r) => <tr key={r.id} className="border-t"><td className="py-1.5 ltr-nums">{new Date(r.startsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</td><td className="py-1.5">{r.clinicianName}</td><td className="py-1.5">{t(`kiorexDoor.live.appt.${r.status}`, { defaultValue: r.status })}</td><td className="py-1.5">{t(`kiorexDoor.live.channel.${r.channel}`)}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {connect && !connect.legacy && connect.steps.find((s) => s.key === "live")?.status === "done" ? <KiorexConnectPassportCard /> : null}
    </section>
  );
}
