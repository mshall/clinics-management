import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useDashboardTodayQuery } from "@/lib/api-hooks";

type CachedAppointment = {
  id: string;
  startsAt?: string;
  patientName?: string;
  status?: string;
};

/**
 * UX-01 — read-only offline "today" view. Prefers live API; falls back to Cache Storage
 * entries populated by the service worker (NetworkFirst for today/appointments/patients).
 */
export function OfflineTodayPage() {
  const { t, i18n } = useTranslation();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const todayQ = useDashboardTodayQuery();
  const [cachedAppts, setCachedAppts] = useState<CachedAppointment[]>([]);
  const [cacheNote, setCacheNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCache() {
      if (!("caches" in window)) return;
      try {
        const cache = await caches.open("kiorly-today-offline");
        const keys = await cache.keys();
        const apptReq = keys.find((k) => k.url.includes("/api/v1/appointments"));
        if (!apptReq) {
          if (!cancelled) setCacheNote(t("pwa.offlineNoCache"));
          return;
        }
        const res = await cache.match(apptReq);
        if (!res) return;
        const json = (await res.json()) as { items?: CachedAppointment[] } | CachedAppointment[];
        const items = Array.isArray(json) ? json : (json.items ?? []);
        if (!cancelled) {
          setCachedAppts(items.slice(0, 40));
          setCacheNote(null);
        }
      } catch {
        if (!cancelled) setCacheNote(t("pwa.offlineNoCache"));
      }
    }
    void loadCache();
    return () => {
      cancelled = true;
    };
  }, [t, online]);

  const dateLabel = todayQ.data?.date
    ? new Date(todayQ.data.date).toLocaleDateString(i18n.language === "ar" ? "ar-EG" : "en-GB")
    : new Date().toLocaleDateString(i18n.language === "ar" ? "ar-EG" : "en-GB");

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t("pwa.offlineTodayTitle")}</h1>
        <p className="text-sm text-muted-foreground ltr-nums">{dateLabel}</p>
        {!online ? (
          <p className="mt-2 text-xs font-medium text-[hsl(var(--warning))] ">{t("pwa.offlineBanner")}</p>
        ) : null}
      </div>

      {todayQ.data ? (
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-lg border p-3">
            <div className="text-muted-foreground">{t("dashboard.today.appointments")}</div>
            <div className="text-lg font-semibold ltr-nums">{todayQ.data.appointments}</div>
          </li>
          <li className="rounded-lg border p-3">
            <div className="text-muted-foreground">{t("dashboard.today.waiting")}</div>
            <div className="text-lg font-semibold ltr-nums">{todayQ.data.waiting}</div>
          </li>
          <li className="rounded-lg border p-3">
            <div className="text-muted-foreground">{t("dashboard.today.seen")}</div>
            <div className="text-lg font-semibold ltr-nums">{todayQ.data.seen}</div>
          </li>
          <li className="rounded-lg border p-3">
            <div className="text-muted-foreground">{t("dashboard.today.noShows")}</div>
            <div className="text-lg font-semibold ltr-nums">{todayQ.data.noShows}</div>
          </li>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{cacheNote ?? t("pwa.offlineLoading")}</p>
      )}

      {cachedAppts.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-medium">{t("pwa.offlineSchedule")}</h2>
          <ul className="divide-y rounded-lg border">
            {cachedAppts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{a.patientName ?? a.id}</span>
                <span className="shrink-0 text-xs text-muted-foreground ltr-nums">
                  {a.startsAt ? new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("pwa.offlineReadOnly")}</p>
      <Link to="/" className="text-sm text-primary underline">
        {t("pwa.backHome")}
      </Link>
    </div>
  );
}
